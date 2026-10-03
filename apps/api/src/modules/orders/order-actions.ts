import type { ReorderResult, ReturnRequest } from '@optical/shared/account';
import { returnRequestSchema } from '@optical/shared/account';
import type { OrderView } from '@optical/shared/checkout';
import type { LensConfig } from '@optical/shared/lens';
import type { FastifyBaseLogger } from 'fastify';
import type { Db } from '../../infra/prisma';
import { queueEmail } from '../../infra/email/outbox';
import type { JobQueue } from '../../infra/queue';
import { AppError } from '../../lib/app-error';
import type { Owner } from '../../plugins/auth';
import type { CartService } from '../cart/cart.service';
import type { PaymentGateway } from '../payments/payment-gateway';
import { releaseCoupon, releaseHolds, restockCommitted, transition } from './lifecycle';
import { orderUrl } from './order-email';
import { orderActions, orderState, providerCode, toOrderView } from './orders.mapper';
import { orderInclude, type OrderRow } from './orders.repository';

const reasonLabels: Record<ReturnRequest['reason'], string> = {
  fit: 'Doesn’t fit well',
  style: 'Didn’t suit me',
  vision: 'Vision isn’t right',
  damaged: 'Arrived damaged',
  'wrong-item': 'Wrong item',
  other: 'Other',
};

interface PendingRefund {
  id: string;
  paymentRef: string;
  amountMinor: number;
}

export interface OrderAccess {
  number: string;
  token: string | undefined;
  userId: string | null;
}

const firstName = (order: OrderRow) => {
  const name = (order.shippingAddress as { fullName?: string }).fullName ?? '';
  return name.split(/\s+/).find((part) => part.length > 0) ?? 'there';
};

/**
 * What a customer can do with a placed order: cancel it before anything is
 * made, ask to return it after delivery, or put the same things back in the
 * bag. Allowed for the account that placed it and for holders of its link.
 */
export class OrderActions {
  constructor(
    private readonly db: Db,
    private readonly gateway: PaymentGateway,
    private readonly carts: CartService,
    private readonly jobs: JobQueue,
    private readonly options: { siteUrl: string },
    private readonly log: Pick<FastifyBaseLogger, 'warn' | 'error'>,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async reload(id: string): Promise<OrderView> {
    const order = await this.db.order.findUniqueOrThrow({ where: { id }, include: orderInclude });
    return toOrderView(order, this.now());
  }

  private link(order: OrderRow) {
    return orderUrl(this.options.siteUrl, order.number, this.gateway.token(order.id));
  }

  async cancel(access: OrderAccess, note?: string): Promise<OrderView> {
    const found = await this.gateway.authorisedOrder(access.number, access.token, access.userId);
    const refund = await this.db.$transaction(async (tx): Promise<PendingRefund | null> => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${found.id}::uuid FOR UPDATE`;
      const order = await tx.order.findUniqueOrThrow({
        where: { id: found.id },
        include: orderInclude,
      });
      if (!orderActions(order, this.now()).cancel)
        throw new AppError(
          'CONFLICT',
          'This order can no longer be cancelled because it is already being made or is on its way. You can return it after delivery.',
        );
      const now = this.now();
      await releaseHolds(tx, { orderId: order.id }, now);
      await restockCommitted(tx, order);
      await transition(tx, orderState(order), 'CANCELLED', {
        note: note ? `Cancelled by the customer: ${note}` : 'Cancelled by the customer.',
      });
      await releaseCoupon(tx, order.id);
      const paid = order.payments.find((payment) => payment.status === 'SUCCEEDED');
      let pending: PendingRefund | null = null;
      if (paid?.providerRef) {
        const created = await tx.refund.create({
          data: {
            paymentId: paid.id,
            orderId: order.id,
            amountMinor: paid.amountMinor,
            reason: 'Cancelled by the customer.',
          },
        });
        pending = { id: created.id, paymentRef: paid.providerRef, amountMinor: paid.amountMinor };
      }
      await queueEmail(tx, order.email, {
        template: 'order-cancelled',
        data: {
          number: order.number,
          customerName: firstName(order),
          orderUrl: this.link(order),
          refundMinor: paid?.amountMinor ?? 0,
        },
      });
      return pending;
    });
    if (refund) await this.sendRefund(found, refund);
    await this.jobs.kickOutbox().catch(() => undefined);
    return this.reload(found.id);
  }

  /**
   * Asks the provider for the money back. A failure leaves the refund
   * PENDING for the team to finish; the customer has already been told.
   */
  private async sendRefund(
    order: OrderRow,
    refund: { id: string; paymentRef: string; amountMinor: number },
  ): Promise<void> {
    try {
      const provider = this.gateway.provider(providerCode(order.paymentProvider));
      const { refundRef } = await provider.refund(refund.paymentRef, refund.amountMinor);
      await this.db.$transaction(async (tx) => {
        await tx.refund.update({
          where: { id: refund.id },
          data: { status: 'SUCCEEDED', providerRef: refundRef },
        });
        await tx.payment.updateMany({
          where: { orderId: order.id, status: 'SUCCEEDED' },
          data: { status: 'REFUNDED' },
        });
        const current = await tx.order.findUniqueOrThrow({
          where: { id: order.id },
          include: orderInclude,
        });
        await transition(tx, orderState(current), 'REFUNDED', { note: 'Refund sent.' });
      });
    } catch (error) {
      this.log.error({ err: error, orderId: order.id }, 'Refund failed; left pending for staff');
    }
  }

  async requestReturn(access: OrderAccess, input: ReturnRequest): Promise<OrderView> {
    const request = returnRequestSchema.parse(input);
    const order = await this.gateway.authorisedOrder(access.number, access.token, access.userId);
    if (!orderActions(order, this.now()).requestReturn)
      throw new AppError(
        'CONFLICT',
        order.status === 'DELIVERED'
          ? 'The return window for this order has closed. Write to us and we will see what we can do.'
          : 'You can ask for a return once the order has been delivered.',
      );
    await this.db.$transaction(async (tx) => {
      const reason = reasonLabels[request.reason];
      await transition(tx, orderState(order), 'RETURN_REQUESTED', {
        note: request.note ? `${reason}: ${request.note}` : reason,
      });
      await queueEmail(tx, order.email, {
        template: 'return-update',
        data: {
          number: order.number,
          customerName: firstName(order),
          orderUrl: this.link(order),
          stage: 'requested',
          refundMinor: null,
        },
      });
    });
    await this.jobs.kickOutbox().catch(() => undefined);
    return this.reload(order.id);
  }

  /**
   * Adds the order's items to the bag again at today's prices. Lenses keep
   * their choices; a prescription the account owns is reused as a saved one,
   * otherwise it is asked for later. Items that can't be added are listed.
   */
  async reorder(access: OrderAccess, owner: Owner): Promise<ReorderResult> {
    const order = await this.gateway.authorisedOrder(access.number, access.token, access.userId);
    const owned = owner.userId
      ? new Set(
          (
            await this.db.prescription.findMany({
              where: {
                userId: owner.userId,
                deletedAt: null,
                id: { in: order.items.flatMap((item) => item.prescriptionId ?? []) },
              },
              select: { id: true },
            })
          ).map((row) => row.id),
        )
      : new Set<string>();
    const result: ReorderResult = { added: 0, skipped: [] };
    for (const item of order.items) {
      const config = item.lensConfig as LensConfig | null;
      let lensConfig: LensConfig | null = config;
      if (config?.prescription) {
        const savedId =
          item.prescriptionId && owned.has(item.prescriptionId) ? item.prescriptionId : null;
        lensConfig = {
          ...config,
          prescription: savedId
            ? { mode: 'saved', prescriptionId: savedId }
            : config.prescription.mode === 'manual'
              ? config.prescription
              : { mode: 'later' },
        };
      }
      try {
        await this.carts.addItem(owner, {
          variantId: item.variantId,
          quantity: item.quantity,
          lensConfig,
        });
        result.added += item.quantity;
      } catch (error) {
        if (!(error instanceof AppError)) throw error;
        result.skipped.push({
          name: `${item.productName} in ${item.colourName}`,
          reason: error.message,
        });
      }
    }
    return result;
  }
}
