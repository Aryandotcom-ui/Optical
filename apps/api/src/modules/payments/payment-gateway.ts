import type {
  MockOutcome,
  OrderView,
  PaymentAction,
  PaymentProviderCode,
  PlacedOrder,
} from '@optical/shared/checkout';
import type { FastifyBaseLogger } from 'fastify';
import type { Db } from '../../infra/prisma';
import { queueEmail } from '../../infra/email/outbox';
import type { JobQueue } from '../../infra/queue';
import { AppError } from '../../lib/app-error';
import { commitHolds, holdStock, transition, type OrderState, type Tx } from '../orders/lifecycle';
import { orderAccessToken, verifyOrderAccess } from '../orders/order-access';
import { orderEmailData, orderUrl } from '../orders/order-email';
import {
  canRetryPayment,
  needsProduction,
  providerCode,
  toOrderView,
} from '../orders/orders.mapper';
import { orderInclude, type OrderRow } from '../orders/orders.repository';
import { simulateMockPayment } from './simulate';
import type { PaymentEvent, PaymentProvider } from './provider';
import type { PaymentRegistry } from './registry';

export interface GatewayOptions {
  secret: string;
  siteUrl: string;
  /** Holds last this long; a retry after expiry holds stock again. */
  holdMinutes: number;
  mockPendingSettleSeconds: number;
}

const toDbProvider = (code: PaymentProviderCode) =>
  code.toUpperCase() as 'MOCK' | 'RAZORPAY' | 'STRIPE' | 'COD';

export function orderState(order: OrderRow): OrderState {
  return {
    id: order.id,
    status: order.status,
    paymentProvider: order.paymentProvider,
    awaitingPrescription: order.awaitingPrescription,
    needsProduction: needsProduction(order),
  };
}

/**
 * Everything between "place order" and "paid": starting and retrying
 * payments, applying verified provider events exactly once, and the
 * emails and stock moves that follow.
 */
export class PaymentGateway {
  constructor(
    private readonly db: Db,
    private readonly registry: PaymentRegistry,
    private readonly jobs: JobQueue,
    private readonly options: GatewayOptions,
    private readonly log: Pick<FastifyBaseLogger, 'warn' | 'error' | 'info'>,
    private readonly now: () => Date = () => new Date(),
  ) {}

  codes(): PaymentProviderCode[] {
    return this.registry.codes();
  }

  provider(code: PaymentProviderCode): PaymentProvider {
    const provider = this.registry.get(code);
    if (!provider) throw new AppError('VALIDATION_FAILED', 'That payment method is not available.');
    return provider;
  }

  private loadOrder(where: { id: string } | { number: string }) {
    return this.db.order.findUnique({ where, include: orderInclude });
  }

  token(orderId: string): string {
    return orderAccessToken(this.options.secret, orderId);
  }

  /** An order for a customer holding its access token; NOT_FOUND otherwise, so numbers can't be probed. */
  async authorisedOrder(number: string, token: string | undefined): Promise<OrderRow> {
    const order = await this.loadOrder({ number });
    if (!order || !token || !verifyOrderAccess(this.options.secret, order.id, token))
      throw AppError.notFound(
        'We could not find that order. Check the link in your confirmation email.',
      );
    return order;
  }

  /** Emails and cart clean-up once an order is confirmed (paid, or cash on delivery). */
  private async confirm(tx: Tx, order: OrderRow): Promise<void> {
    if (order.cartId) {
      await tx.cartItem.deleteMany({ where: { cartId: order.cartId } });
      await tx.cart.updateMany({ where: { id: order.cartId }, data: { couponCode: null } });
    }
    const url = orderUrl(this.options.siteUrl, order.number, this.token(order.id));
    await queueEmail(tx, order.email, {
      template: 'order-confirmed',
      data: orderEmailData(order, url),
    });
  }

  private actionFor(order: OrderRow): PaymentAction | null {
    const payment = order.payments[0];
    if (!payment) return null;
    if (order.paymentProvider === 'COD') return { kind: 'none' };
    if (payment.actionUrl) return { kind: 'redirect', url: payment.actionUrl };
    if (order.paymentProvider === 'MOCK') return { kind: 'mock', paymentId: payment.id };
    return null;
  }

  /** The response to a (possibly repeated) place-order request. */
  async placedOrder(orderId: string, paymentError: string | null = null): Promise<PlacedOrder> {
    const order = await this.loadOrder({ id: orderId });
    if (!order) throw AppError.notFound();
    return {
      order: toOrderView(order),
      accessToken: this.token(order.id),
      payment: this.actionFor(order),
      paymentError,
    };
  }

  /** Creates the provider intent for an order's newest payment, right after it is placed or retried. */
  async startPayment(orderId: string): Promise<PlacedOrder> {
    const order = await this.loadOrder({ id: orderId });
    const payment = order?.payments[0];
    if (!order || !payment) throw AppError.notFound();
    const code = providerCode(order.paymentProvider);
    const address = order.shippingAddress as unknown as { fullName: string };
    try {
      const intent = await this.provider(code).createIntent({
        paymentId: payment.id,
        orderNumber: order.number,
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        customer: { name: address.fullName, email: order.email, phone: order.phone ?? '' },
        returnUrl: orderUrl(this.options.siteUrl, order.number, this.token(order.id)),
      });
      await this.db.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            providerRef: intent.providerRef,
            actionUrl: intent.action.kind === 'redirect' ? intent.action.url : null,
          },
        });
        if (code === 'cod') await this.confirm(tx, order);
      });
      if (code === 'cod') await this.kickOutbox();
      return await this.placedOrder(order.id);
    } catch (error) {
      if (error instanceof AppError) throw error;
      this.log.error({ err: error, orderId: order.id }, 'Could not start the payment');
      await this.db.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED', failureReason: 'The payment service could not be reached.' },
      });
      return this.placedOrder(
        order.id,
        'We saved your order but could not reach the payment service. Try paying again in a moment.',
      );
    }
  }

  /** A new payment attempt after a failure, with the same or another online provider. */
  async retry(
    number: string,
    token: string | undefined,
    code: Exclude<PaymentProviderCode, 'cod'>,
  ): Promise<PlacedOrder> {
    const order = await this.authorisedOrder(number, token);
    this.provider(code);
    if (!canRetryPayment(order))
      throw new AppError(
        'CONFLICT',
        'This order can no longer be paid for. Place a new order instead.',
      );
    await this.db.$transaction(async (tx) => {
      const now = this.now();
      if (order.reservations.length === 0)
        await holdStock(
          tx,
          order.id,
          order.items.map((item) => ({
            variantId: item.variantId,
            quantity: item.quantity,
            name: item.productName,
          })),
          new Date(now.getTime() + this.options.holdMinutes * 60_000),
        );
      if (order.status === 'PAYMENT_FAILED')
        await transition(tx, orderState(order), 'PENDING_PAYMENT', { note: 'Payment retried' });
      await tx.order.update({
        where: { id: order.id },
        data: { paymentProvider: toDbProvider(code) },
      });
      await tx.payment.create({
        data: {
          orderId: order.id,
          provider: toDbProvider(code),
          amountMinor: order.totalMinor,
          currency: order.currency,
        },
      });
    });
    return this.startPayment(order.id);
  }

  /** Mock provider: the customer picks an outcome; it arrives later as a signed webhook. */
  async simulate(
    paymentId: string,
    outcome: MockOutcome,
    token: string | undefined,
  ): Promise<OrderView> {
    const orderId = await simulateMockPayment(
      {
        db: this.db,
        provider: this.registry.get('mock'),
        jobs: this.jobs,
        secret: this.options.secret,
        settleSeconds: this.options.mockPendingSettleSeconds,
        log: this.log,
      },
      paymentId,
      outcome,
      token,
    );
    const order = await this.loadOrder({ id: orderId });
    if (!order) throw AppError.notFound();
    return toOrderView(order);
  }

  /**
   * Applies one verified provider event, exactly once: the event id is
   * recorded in the same transaction, so a replayed or duplicated webhook
   * changes nothing. Returns false for a duplicate.
   */
  async applyEvent(code: PaymentProviderCode, event: PaymentEvent): Promise<boolean> {
    // Set inside the transaction; read once it has committed.
    const outcome = { confirmed: false };
    const applied = await this.db.$transaction(async (tx) => {
      const inserted = await tx.$executeRaw`
        INSERT INTO "WebhookEvent" (id, provider, "eventId", type, payload, "processedAt", "createdAt")
        VALUES (gen_random_uuid(), ${code}, ${event.eventId}, ${`payment.${event.outcome}`},
                ${JSON.stringify(event)}::jsonb, now(), now())
        ON CONFLICT (provider, "eventId") DO NOTHING`;
      if (inserted === 0) return false;

      const payment = await tx.payment.findUnique({
        where: {
          provider_providerRef: { provider: toDbProvider(code), providerRef: event.providerRef },
        },
      });
      if (!payment) {
        this.log.warn(
          { provider: code, ref: event.providerRef },
          'Payment event for an unknown payment',
        );
        return true;
      }
      // Lock the order so concurrent events for it apply one at a time.
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${payment.orderId}::uuid FOR UPDATE`;
      const order = await tx.order.findUnique({
        where: { id: payment.orderId },
        include: orderInclude,
      });
      if (!order) return true;
      if (payment.status === 'SUCCEEDED' || payment.status === 'REFUNDED') return true;
      const isLatest = order.payments[0]?.id === payment.id;

      if (event.outcome === 'pending') {
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: 'PENDING', method: event.method ?? null },
        });
        return true;
      }
      if (event.outcome === 'failed') {
        if (payment.status === 'FAILED') return true;
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: 'FAILED',
            failureReason: event.failureReason ?? 'The payment was declined.',
          },
        });
        if (isLatest && order.status === 'PENDING_PAYMENT') {
          await transition(tx, orderState(order), 'PAYMENT_FAILED', {
            note: event.failureReason ?? undefined,
          });
          const url = orderUrl(this.options.siteUrl, order.number, this.token(order.id));
          await queueEmail(tx, order.email, {
            template: 'payment-failed',
            data: orderEmailData(order, url),
            reason: event.failureReason ?? null,
          });
          outcome.confirmed = true;
        }
        return true;
      }

      await tx.payment.update({
        where: { id: payment.id },
        data: { status: 'SUCCEEDED', method: event.method ?? null },
      });
      if (order.status === 'CANCELLED') {
        // Paid after the hold expired and the order was cancelled: refund it.
        await tx.refund.create({
          data: {
            paymentId: payment.id,
            orderId: order.id,
            amountMinor: payment.amountMinor,
            reason: 'Payment arrived after the order was cancelled.',
          },
        });
        await tx.order.update({
          where: { id: order.id },
          data: { internalNote: 'Paid after cancellation; refund pending.' },
        });
        return true;
      }
      if (order.status !== 'PENDING_PAYMENT' && order.status !== 'PAYMENT_FAILED') return true;
      let state = orderState(order);
      if (state.status === 'PAYMENT_FAILED') state = await transition(tx, state, 'PENDING_PAYMENT');
      await commitHolds(tx, order.id, this.now());
      state = await transition(tx, state, 'PAID');
      if (order.awaitingPrescription) await transition(tx, state, 'PRESCRIPTION_REVIEW');
      await this.confirm(tx, order);
      outcome.confirmed = true;
      return true;
    });
    if (outcome.confirmed) await this.kickOutbox();
    return applied;
  }

  /** Verifies and applies a provider webhook. */
  async handleWebhook(
    code: PaymentProviderCode,
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<{ received: number; duplicates: number }> {
    const provider = this.registry.get(code);
    if (!provider || code === 'cod') throw AppError.notFound('Unknown payment provider.');
    const verification = provider.verifyWebhook(rawBody, headers);
    if (!verification.ok)
      throw new AppError(
        'UNAUTHENTICATED',
        verification.reason === 'expired'
          ? 'Webhook timestamp is too old.'
          : 'Webhook signature is not valid.',
      );
    let duplicates = 0;
    for (const event of verification.events)
      if (!(await this.applyEvent(code, event))) duplicates += 1;
    return { received: verification.events.length, duplicates };
  }

  /** Asks providers about payments still open after a few minutes, in case a webhook was lost. */
  async reconcile(olderThanMs = 2 * 60_000): Promise<number> {
    const now = this.now().getTime();
    const open = await this.db.payment.findMany({
      where: {
        status: { in: ['CREATED', 'PENDING'] },
        provider: { not: 'COD' },
        providerRef: { not: null },
        createdAt: { lt: new Date(now - olderThanMs), gt: new Date(now - 2 * 86_400_000) },
      },
      take: 50,
    });
    let settled = 0;
    for (const payment of open) {
      const code = providerCode(payment.provider);
      const provider = this.registry.get(code);
      if (!provider || !payment.providerRef) continue;
      try {
        const status = await provider.fetchStatus(payment.providerRef);
        if (status && status.outcome !== 'pending' && (await this.applyEvent(code, status)))
          settled += 1;
      } catch (error) {
        this.log.warn({ err: error, paymentId: payment.id }, 'Payment status check failed');
      }
    }
    return settled;
  }

  private async kickOutbox(): Promise<void> {
    await this.jobs.kickOutbox().catch((error: unknown) => {
      this.log.warn(
        { err: error },
        'Could not wake the email worker; emails go out on its next run',
      );
    });
  }
}
