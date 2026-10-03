import { randomUUID } from 'node:crypto';
import type { Prisma } from '../../generated/prisma/client';
import type { Db } from '../../infra/prisma';
import { randomToken, sha256Hex } from '../../lib/tokens';

/** A sign-in lasts this long after the last refresh. */
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
/**
 * A token rotated this recently may be presented once more without counting
 * as reuse: two tabs refreshing at the same moment both send the old token.
 * The late request gets an access token but no new refresh token.
 */
export const ROTATION_GRACE_SECONDS = 30;

type Tx = Prisma.TransactionClient | Db;

export type RotationResult =
  | { kind: 'rotated'; userId: string; familyId: string; token: string }
  | { kind: 'grace'; userId: string; familyId: string }
  | { kind: 'reuse'; userId: string; familyId: string }
  | { kind: 'invalid' };

interface TokenRow {
  id: string;
  userId: string;
  familyId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedById: string | null;
}

/**
 * Opaque refresh tokens, stored only as their SHA-256. Every refresh
 * replaces the token with a new one in the same family; presenting a
 * replaced token again means it was copied, so the whole family (that
 * sign-in, on every device holding it) is revoked.
 */
export class RefreshTokens {
  constructor(
    private readonly db: Db,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private expiry(): Date {
    return new Date(this.now().getTime() + REFRESH_TOKEN_TTL_SECONDS * 1000);
  }

  /** Starts a new family (a new sign-in), or continues one. */
  async issue(
    tx: Tx,
    userId: string,
    options: { familyId?: string; userAgent?: string | null } = {},
  ): Promise<{ token: string; familyId: string; id: string }> {
    const token = randomToken();
    const familyId = options.familyId ?? randomUUID();
    const row = await tx.refreshToken.create({
      data: {
        userId,
        familyId,
        tokenHash: sha256Hex(token),
        expiresAt: this.expiry(),
        userAgent: options.userAgent?.slice(0, 200) ?? null,
      },
      select: { id: true },
    });
    return { token, familyId, id: row.id };
  }

  /** Swaps a refresh token for a new one, detecting reuse. */
  rotate(token: string, userAgent: string | null): Promise<RotationResult> {
    return this.db.$transaction(async (tx) => {
      // Lock the row: two concurrent refreshes with one token must not both rotate it.
      const [row] = await tx.$queryRaw<TokenRow[]>`
        SELECT id, "userId", "familyId", "expiresAt", "revokedAt", "replacedById"
        FROM "RefreshToken" WHERE "tokenHash" = ${sha256Hex(token)} FOR UPDATE`;
      const now = this.now();
      if (!row || row.expiresAt <= now) return { kind: 'invalid' };
      const user = await tx.user.findFirst({
        where: { id: row.userId, deletedAt: null },
        select: { id: true },
      });
      if (!user) return { kind: 'invalid' };

      if (row.revokedAt) {
        // Revoked by sign-out, a password change or earlier reuse: just refuse.
        if (!row.replacedById) return { kind: 'invalid' };
        const sinceRotation = now.getTime() - row.revokedAt.getTime();
        if (sinceRotation <= ROTATION_GRACE_SECONDS * 1000) {
          const live = await tx.refreshToken.count({
            where: { familyId: row.familyId, revokedAt: null, expiresAt: { gt: now } },
          });
          if (live > 0) return { kind: 'grace', userId: row.userId, familyId: row.familyId };
          return { kind: 'invalid' };
        }
        await this.revokeFamilyIn(tx, row.familyId);
        await tx.auditLog.create({
          data: {
            actorId: row.userId,
            action: 'auth.refresh-token-reuse',
            entityType: 'User',
            entityId: row.userId,
            after: { familyId: row.familyId },
          },
        });
        return { kind: 'reuse', userId: row.userId, familyId: row.familyId };
      }

      const next = await this.issue(tx, row.userId, { familyId: row.familyId, userAgent });
      await tx.refreshToken.update({
        where: { id: row.id },
        data: { revokedAt: now, replacedById: next.id },
      });
      return { kind: 'rotated', userId: row.userId, familyId: row.familyId, token: next.token };
    });
  }

  /** True while the family has a token that can still be refreshed. */
  async isLive(familyId: string, userId: string): Promise<boolean> {
    const live = await this.db.refreshToken.findFirst({
      where: { familyId, userId, revokedAt: null, expiresAt: { gt: this.now() } },
      select: { id: true },
    });
    return live !== null;
  }

  private revokeFamilyIn(tx: Tx, familyId: string) {
    return tx.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: this.now() },
    });
  }

  /** Signs out one session (this device). */
  async revokeFamily(familyId: string): Promise<void> {
    await this.revokeFamilyIn(this.db, familyId);
  }

  /** The family a presented refresh token belongs to, if it exists. */
  async familyOf(token: string): Promise<string | null> {
    const row = await this.db.refreshToken.findUnique({
      where: { tokenHash: sha256Hex(token) },
      select: { familyId: true },
    });
    return row?.familyId ?? null;
  }

  /** Signs out everywhere, optionally keeping the current session. */
  async revokeAll(tx: Tx, userId: string, exceptFamilyId?: string): Promise<void> {
    await tx.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptFamilyId ? { familyId: { not: exceptFamilyId } } : {}),
      },
      data: { revokedAt: this.now() },
    });
  }
}
