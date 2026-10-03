import type {
  AuthSession,
  ChangePassword,
  Login,
  Register,
  ResetPassword,
  User,
} from '@optical/shared/account';
import {
  changePasswordSchema,
  loginSchema,
  passwordProblem,
  passwordProblemMessages,
  registerFromOrderSchema,
  registerSchema,
  resetPasswordSchema,
} from '@optical/shared/account';
import type { Prisma } from '../../generated/prisma/client';
import type { Db } from '../../infra/prisma';
import { queueEmail } from '../../infra/email/outbox';
import { AppError } from '../../lib/app-error';
import { hashPassword, verifyPassword } from '../../lib/password';
import { randomToken, sha256Hex } from '../../lib/tokens';
import { verifyOrderAccess } from '../orders/order-access';
import type { AccessTokens } from './access-token';
import { mergeGuestInto } from './merge';
import type { RefreshTokens } from './refresh-tokens';

/** Failed passwords before sign-in pauses. */
export const LOCKOUT_THRESHOLD = 5;
export const MAX_LOCKOUT_MINUTES = 60;
export const RESET_TOKEN_TTL_MINUTES = 30;
/** Reset emails per account per hour, so the form can't be used to flood an inbox. */
export const RESET_EMAILS_PER_HOUR = 3;

/** Minutes sign-in is paused after this many consecutive failures: 1, 2, 4 … up to 60. */
export function lockoutMinutes(failures: number): number {
  if (failures < LOCKOUT_THRESHOLD) return 0;
  return Math.min(2 ** (failures - LOCKOUT_THRESHOLD), MAX_LOCKOUT_MINUTES);
}

export interface ClientContext {
  /** This browser's guest session, whose bag and uploads move into the account. */
  sessionHash: string | null;
  userAgent: string | null;
}

export interface IssuedSession {
  session: AuthSession;
  access: string;
  /** Absent when an access token was re-issued inside the rotation grace window. */
  refresh?: string;
}

type UserRow = Prisma.UserGetPayload<object>;
type Tx = Prisma.TransactionClient;

export function toUser(row: UserRow): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    marketingOptIn: row.marketingOptIn,
    createdAt: row.createdAt.toISOString(),
  };
}

const isUniqueViolation = (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002';

const invalidCredentials = () =>
  new AppError(
    'UNAUTHENTICATED',
    'That email and password do not match. Check both and try again.',
  );

function lockedOut(until: Date, now: Date) {
  const minutes = Math.max(1, Math.ceil((until.getTime() - now.getTime()) / 60_000));
  return new AppError(
    'RATE_LIMITED',
    `Too many incorrect passwords, so signing in is paused for ${minutes} minute${minutes === 1 ? '' : 's'}. You can reset your password instead.`,
  );
}

export interface AuthServiceOptions {
  secret: string;
  siteUrl: string;
}

/** Registration, sign-in, token refresh, sign-out and password recovery. */
export class AuthService {
  /** Compared against when the email is unknown, so timing doesn't reveal which emails exist. */
  private readonly decoyHash: Promise<string>;

  constructor(
    private readonly db: Db,
    private readonly tokens: AccessTokens,
    private readonly refreshTokens: RefreshTokens,
    private readonly options: AuthServiceOptions,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.decoyHash = hashPassword(randomToken());
  }

  private async startSession(tx: Tx, user: UserRow, context: ClientContext) {
    const merged = await mergeGuestInto(tx, user.id, context.sessionHash, this.now());
    const refresh = await this.refreshTokens.issue(tx, user.id, { userAgent: context.userAgent });
    const access = await this.tokens.sign({
      userId: user.id,
      role: user.role,
      familyId: refresh.familyId,
    });
    return {
      session: { user: toUser(user), mergedCartItems: merged },
      access,
      refresh: refresh.token,
    };
  }

  private welcome(tx: Tx, user: UserRow) {
    return queueEmail(tx, user.email, {
      template: 'welcome',
      data: {
        name: user.name.split(/\s+/)[0] ?? user.name,
        shopUrl: this.options.siteUrl,
        accountUrl: `${this.options.siteUrl}/account`,
      },
    });
  }

  private alreadyRegistered(email: string) {
    return new AppError(
      'CONFLICT',
      `An account already uses ${email}. Sign in, or reset your password if you have forgotten it.`,
      [{ path: 'email', message: 'This email already has an account.' }],
    );
  }

  async register(input: Register, context: ClientContext): Promise<IssuedSession> {
    const request = registerSchema.parse(input);
    if (await this.db.user.findUnique({ where: { email: request.email }, select: { id: true } }))
      throw this.alreadyRegistered(request.email);
    const passwordHash = await hashPassword(request.password);
    try {
      return await this.db.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: request.email,
            name: request.name,
            passwordHash,
            marketingOptIn: request.marketingOptIn,
          },
        });
        await this.welcome(tx, user);
        return this.startSession(tx, user, context);
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw this.alreadyRegistered(request.email);
      throw error;
    }
  }

  async login(input: Login, context: ClientContext): Promise<IssuedSession> {
    const request = loginSchema.parse(input);
    const now = this.now();
    const user = await this.db.user.findUnique({ where: { email: request.email } });
    if (!user || user.deletedAt || !user.passwordHash) {
      await verifyPassword(await this.decoyHash, request.password);
      throw invalidCredentials();
    }
    // While paused, even the right password is refused: guessing has to wait.
    if (user.lockedUntil && user.lockedUntil > now) throw lockedOut(user.lockedUntil, now);

    if (!(await verifyPassword(user.passwordHash, request.password))) {
      const { failedLoginCount } = await this.db.user.update({
        where: { id: user.id },
        data: { failedLoginCount: { increment: 1 } },
        select: { failedLoginCount: true },
      });
      const minutes = lockoutMinutes(failedLoginCount);
      if (minutes === 0) throw invalidCredentials();
      const until = new Date(now.getTime() + minutes * 60_000);
      await this.db.user.update({ where: { id: user.id }, data: { lockedUntil: until } });
      await this.audit(this.db, user.id, 'auth.locked-out', { failedLoginCount, minutes });
      throw lockedOut(until, now);
    }

    return this.db.$transaction(async (tx) => {
      const fresh = await tx.user.update({
        where: { id: user.id },
        data: { failedLoginCount: 0, lockedUntil: null },
      });
      return this.startSession(tx, fresh, context);
    });
  }

  /** Swaps the refresh token for new tokens. Reuse of a replaced token ends that sign-in everywhere. */
  async refresh(token: string | undefined, userAgent: string | null): Promise<IssuedSession> {
    const expired = () =>
      new AppError('UNAUTHENTICATED', 'Your sign-in has expired. Sign in again to continue.');
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw expired();
    const result = await this.refreshTokens.rotate(token, userAgent);
    if (result.kind === 'invalid' || result.kind === 'reuse') throw expired();
    const user = await this.db.user.findUniqueOrThrow({ where: { id: result.userId } });
    const access = await this.tokens.sign({
      userId: user.id,
      role: user.role,
      familyId: result.familyId,
    });
    return {
      session: { user: toUser(user), mergedCartItems: 0 },
      access,
      ...(result.kind === 'rotated' ? { refresh: result.token } : {}),
    };
  }

  /** Ends this device's sign-in. Safe to call when already signed out. */
  async logout(refreshToken: string | undefined, familyId: string | null): Promise<void> {
    const family =
      familyId ?? (refreshToken ? await this.refreshTokens.familyOf(refreshToken) : null);
    if (family) await this.refreshTokens.revokeFamily(family);
  }

  async me(userId: string): Promise<User> {
    const user = await this.db.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!user) throw new AppError('UNAUTHENTICATED', 'Sign in to continue.');
    return toUser(user);
  }

  /**
   * Emails a single-use reset link. The response is the same whether or not
   * the email has an account. The token travels in the URL fragment, so it
   * never reaches a server log or a Referer header.
   */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.db.user.findUnique({ where: { email } });
    if (!user || user.deletedAt) return;
    const now = this.now();
    const recent = await this.db.passwordResetToken.count({
      where: { userId: user.id, createdAt: { gt: new Date(now.getTime() - 3_600_000) } },
    });
    if (recent >= RESET_EMAILS_PER_HOUR) return;
    const token = randomToken();
    await this.db.$transaction(async (tx) => {
      await tx.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: sha256Hex(token),
          createdAt: now,
          expiresAt: new Date(now.getTime() + RESET_TOKEN_TTL_MINUTES * 60_000),
        },
      });
      await queueEmail(tx, user.email, {
        template: 'password-reset',
        data: {
          name: user.name.split(/\s+/)[0] ?? user.name,
          resetUrl: `${this.options.siteUrl}/reset-password#token=${token}`,
          expiresMinutes: RESET_TOKEN_TTL_MINUTES,
        },
      });
    });
  }

  private checkNewPassword(password: string, email: string, path: string) {
    const problem = passwordProblem(password, email);
    if (problem)
      throw new AppError('VALIDATION_FAILED', passwordProblemMessages[problem], [
        { path, message: passwordProblemMessages[problem] },
      ]);
  }

  private passwordChanged(tx: Tx | Db, user: UserRow) {
    return queueEmail(tx, user.email, {
      template: 'password-changed',
      data: {
        name: user.name.split(/\s+/)[0] ?? user.name,
        forgotUrl: `${this.options.siteUrl}/forgot-password`,
      },
    });
  }

  /** Sets a new password from a reset link, ends every sign-in and lifts any lockout. */
  async resetPassword(input: ResetPassword): Promise<void> {
    const request = resetPasswordSchema.parse(input);
    const now = this.now();
    const row = await this.db.passwordResetToken.findUnique({
      where: { tokenHash: sha256Hex(request.token) },
      include: { user: true },
    });
    const invalid = new AppError(
      'VALIDATION_FAILED',
      'This reset link has expired or was already used. Ask for a new one.',
      [{ path: 'token', message: 'Expired or used.' }],
    );
    if (!row || row.usedAt || row.expiresAt <= now || row.user.deletedAt) throw invalid;
    this.checkNewPassword(request.password, row.user.email, 'password');
    const passwordHash = await hashPassword(request.password);
    await this.db.$transaction(async (tx) => {
      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: row.id, usedAt: null },
        data: { usedAt: now },
      });
      if (claimed.count === 0) throw invalid;
      await tx.passwordResetToken.updateMany({
        where: { userId: row.userId, usedAt: null },
        data: { usedAt: now },
      });
      await tx.user.update({
        where: { id: row.userId },
        data: { passwordHash, failedLoginCount: 0, lockedUntil: null },
      });
      await this.refreshTokens.revokeAll(tx, row.userId);
      await this.passwordChanged(tx, row.user);
      await this.audit(tx, row.userId, 'auth.password-reset');
    });
  }

  /** Changes the password, keeping this device signed in and signing out every other. */
  async changePassword(userId: string, familyId: string, input: ChangePassword): Promise<void> {
    const request = changePasswordSchema.parse(input);
    const user = await this.db.user.findFirstOrThrow({ where: { id: userId, deletedAt: null } });
    if (!user.passwordHash || !(await verifyPassword(user.passwordHash, request.currentPassword)))
      throw new AppError('VALIDATION_FAILED', 'Your current password is not right.', [
        { path: 'currentPassword', message: 'Check your current password.' },
      ]);
    this.checkNewPassword(request.newPassword, user.email, 'newPassword');
    const passwordHash = await hashPassword(request.newPassword);
    await this.db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash } });
      await this.refreshTokens.revokeAll(tx, userId, familyId);
      await this.passwordChanged(tx, user);
      await this.audit(tx, userId, 'auth.password-changed');
    });
  }

  /** "Create an account" after a guest checkout: the order's email, one new password. */
  async registerFromOrder(input: unknown, context: ClientContext): Promise<IssuedSession> {
    const request = registerFromOrderSchema.parse(input);
    const order = await this.db.order.findUnique({
      where: { number: request.number },
      select: { id: true, email: true, phone: true, userId: true, shippingAddress: true },
    });
    if (!order || !verifyOrderAccess(this.options.secret, order.id, request.token))
      throw AppError.notFound('We could not find that order. Open the link in your email again.');
    if (order.userId)
      throw new AppError('CONFLICT', 'This order is already in an account. Sign in to see it.');
    if (await this.db.user.findUnique({ where: { email: order.email }, select: { id: true } }))
      throw this.alreadyRegistered(order.email);
    this.checkNewPassword(request.password, order.email, 'password');
    const passwordHash = await hashPassword(request.password);
    const name = (order.shippingAddress as { fullName?: string }).fullName ?? order.email;
    try {
      return await this.db.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: { email: order.email, name, phone: order.phone, passwordHash },
        });
        await tx.order.update({ where: { id: order.id }, data: { userId: user.id } });
        await tx.prescription.updateMany({
          where: { userId: null, orderItems: { some: { orderId: order.id } } },
          data: { userId: user.id },
        });
        await this.welcome(tx, user);
        return this.startSession(tx, user, context);
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw this.alreadyRegistered(order.email);
      throw error;
    }
  }

  private async audit(
    tx: Tx | Db,
    userId: string,
    action: string,
    after?: Prisma.InputJsonValue,
  ): Promise<void> {
    await tx.auditLog.create({
      data: {
        actorId: userId,
        action,
        entityType: 'User',
        entityId: userId,
        ...(after ? { after } : {}),
      },
    });
  }
}
