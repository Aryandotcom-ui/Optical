import type { OrderList, UpdateProfile, User } from '@optical/shared/account';
import { updateProfileSchema } from '@optical/shared/account';
import { orderStatusCopy } from '@optical/shared/orders';
import type { Db } from '../../infra/prisma';
import { queueEmail } from '../../infra/email/outbox';
import { AppError } from '../../lib/app-error';
import { verifyPassword } from '../../lib/password';
import { toUser } from '../auth/auth.service';
import type { AccountPrescriptions } from './prescriptions';
import { toSavedAddress } from './addresses';

/** Orders still being paid for, made or delivered need their customer, so they block deletion. */
const OPEN_STATUSES = [
  'PAID',
  'PRESCRIPTION_REVIEW',
  'IN_PRODUCTION',
  'QUALITY_CHECK',
  'SHIPPED',
  'RETURN_REQUESTED',
] as const;

export const ORDER_PAGE_SIZE = 10;

/** Profile, order history, data export and account deletion. */
export class AccountService {
  constructor(
    private readonly db: Db,
    private readonly prescriptions: AccountPrescriptions,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async updateProfile(userId: string, input: UpdateProfile): Promise<User> {
    const request = updateProfileSchema.parse(input);
    const user = await this.db.user.update({
      where: { id: userId },
      data: { name: request.name, phone: request.phone, marketingOptIn: request.marketingOptIn },
    });
    return toUser(user);
  }

  async orders(userId: string, page: number): Promise<OrderList> {
    const where = { userId };
    const [total, rows] = await this.db.$transaction([
      this.db.order.count({ where }),
      this.db.order.findMany({
        where,
        orderBy: { placedAt: 'desc' },
        skip: (page - 1) * ORDER_PAGE_SIZE,
        take: ORDER_PAGE_SIZE,
        include: {
          items: {
            orderBy: { createdAt: 'asc' },
            select: { productName: true, quantity: true, imageUrl: true },
          },
        },
      }),
    ]);
    return {
      items: rows.map((order) => ({
        number: order.number,
        status: order.status,
        statusLabel:
          order.paymentProvider === 'COD' && order.status === 'PENDING_PAYMENT'
            ? 'Order confirmed'
            : orderStatusCopy[order.status].label,
        placedAt: order.placedAt.toISOString(),
        totalMinor: order.totalMinor,
        itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
        itemNames: order.items.map((item) => item.productName),
        imageUrl: order.items.find((item) => item.imageUrl)?.imageUrl ?? null,
      })),
      page,
      pageSize: ORDER_PAGE_SIZE,
      total,
    };
  }

  /**
   * Everything we hold about the customer, as JSON (data portability).
   * Prescription files are listed but not embedded; they are downloadable
   * from the account while signed in.
   */
  async exportData(userId: string): Promise<Record<string, unknown>> {
    const user = await this.db.user.findUniqueOrThrow({ where: { id: userId } });
    const [addresses, prescriptions, orders, wishlist] = await Promise.all([
      this.db.address.findMany({ where: { userId, deletedAt: null } }),
      this.prescriptions.list(userId),
      this.db.order.findMany({
        where: { userId },
        orderBy: { placedAt: 'desc' },
        include: {
          items: true,
          events: { where: { visibleToCustomer: true }, orderBy: { createdAt: 'asc' } },
        },
      }),
      this.db.wishlist.findUnique({
        where: { userId },
        include: { items: { include: { product: { select: { name: true, slug: true } } } } },
      }),
    ]);
    return {
      exportedAt: this.now().toISOString(),
      profile: toUser(user),
      addresses: addresses.map(toSavedAddress),
      prescriptions: prescriptions.map(({ previewUrl: _url, ...rest }) => rest),
      orders: orders.map((order) => ({
        number: order.number,
        status: order.status,
        placedAt: order.placedAt.toISOString(),
        email: order.email,
        phone: order.phone,
        totalMinor: order.totalMinor,
        currency: order.currency,
        shippingAddress: order.shippingAddress,
        items: order.items.map((item) => ({
          product: item.productName,
          colour: item.colourName,
          sku: item.sku,
          quantity: item.quantity,
          totalMinor: item.totalMinor,
          lensConfig: item.lensConfig,
        })),
        timeline: order.events.map((event) => ({
          status: event.toStatus,
          at: event.createdAt.toISOString(),
        })),
      })),
      wishlist: wishlist?.items.map((item) => item.product) ?? [],
    };
  }

  /**
   * Deletes the account after checking the password. Profile, addresses,
   * saved prescriptions (unless an order needs them), wishlist, bag and
   * sign-ins are erased; past orders stay for tax records, unlinked.
   */
  async deleteAccount(userId: string, password: string): Promise<void> {
    const user = await this.db.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!user) throw new AppError('UNAUTHENTICATED', 'Sign in to continue.');
    if (!user.passwordHash || !(await verifyPassword(user.passwordHash, password)))
      throw new AppError('VALIDATION_FAILED', 'That password is not right.', [
        { path: 'password', message: 'Check your password.' },
      ]);
    const open = await this.db.order.count({
      where: { userId, status: { in: [...OPEN_STATUSES] } },
    });
    if (open > 0)
      throw new AppError(
        'CONFLICT',
        'You have an order on its way or being made. You can delete your account once it has been delivered, or cancel it first.',
      );

    const rows = await this.db.prescription.findMany({
      where: { userId, deletedAt: null },
      select: { id: true, fileKey: true, _count: { select: { orderItems: true } } },
    });
    await this.prescriptions.erase(rows);
    const now = this.now();
    await this.db.$transaction(async (tx) => {
      await queueEmail(tx, user.email, {
        template: 'account-deleted',
        data: { name: user.name.split(/\s+/)[0] ?? user.name },
      });
      await tx.prescription.updateMany({ where: { userId }, data: { userId: null } });
      await tx.address.deleteMany({ where: { userId } });
      await tx.wishlist.deleteMany({ where: { userId } });
      await tx.cart.deleteMany({ where: { userId } });
      await tx.refreshToken.deleteMany({ where: { userId } });
      await tx.passwordResetToken.deleteMany({ where: { userId } });
      await tx.order.updateMany({ where: { userId }, data: { userId: null } });
      await tx.user.update({
        where: { id: userId },
        data: {
          email: `deleted-${userId}@deleted.invalid`,
          name: 'Deleted customer',
          phone: null,
          passwordHash: null,
          marketingOptIn: false,
          failedLoginCount: 0,
          lockedUntil: null,
          deletedAt: now,
        },
      });
      await tx.auditLog.create({
        data: { actorId: userId, action: 'account.deleted', entityType: 'User', entityId: userId },
      });
    });
  }
}
