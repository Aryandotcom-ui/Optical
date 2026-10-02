import type { PlacedOrder } from '@optical/shared/checkout';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dispatchOutbox, MAX_EMAIL_ATTEMPTS, queueEmail } from '../src/infra/email/outbox';
import { MemoryEmailProvider } from '../src/infra/email/provider';
import { RecordingJobQueue } from '../src/infra/queue';
import { runOutbox, runReconcile, runReservations, type JobContext } from '../src/jobs/handlers';
import { expireHolds } from '../src/modules/orders/expiry';
import { PaymentGateway } from '../src/modules/payments/payment-gateway';
import { createPaymentRegistry } from '../src/modules/payments/registry';
import { deliveryAddress, stockedVariant, TestBrowser } from './browser';
import { buildDbTestApp, testEnv } from './helpers';

let context: Awaited<ReturnType<typeof buildDbTestApp>>;
let gateway: PaymentGateway;
const quiet = { info: () => undefined, warn: () => undefined, error: () => undefined };

beforeAll(async () => {
  context = await buildDbTestApp();
  gateway = new PaymentGateway(
    context.db,
    createPaymentRegistry(testEnv(), context.mockBank),
    new RecordingJobQueue(),
    {
      secret: testEnv().APP_SECRET,
      siteUrl: 'http://localhost:3000',
      holdMinutes: 15,
      mockPendingSettleSeconds: 30,
    },
    quiet,
  );
});
afterAll(async () => {
  await context.app.close();
});

async function placeMockOrder(): Promise<PlacedOrder> {
  const frame = await stockedVariant(context.db, 'wilder');
  const browser = new TestBrowser(context.app);
  await browser.post('/v1/cart/items', { variantId: frame.id });
  const quote = await browser.post('/v1/checkout/quote', {
    shippingSpeed: 'express',
    postalCode: deliveryAddress.postalCode,
  });
  return (
    await browser.post(
      '/v1/checkout/orders',
      {
        contact: { email: 'jobs@example.com', phone: '9876543210' },
        address: deliveryAddress,
        shippingSpeed: 'express',
        paymentProvider: 'mock',
        expectedTotalMinor: quote.json<{ pricing: { totalMinor: number } }>().pricing.totalMinor,
      },
      { 'idempotency-key': crypto.randomUUID() },
    )
  ).json<PlacedOrder>();
}

describe('email outbox', () => {
  it('retries with backoff and gives up after six attempts', async () => {
    const to = `outbox-${crypto.randomUUID()}@example.com`;
    await queueEmail(context.db, to, {
      template: 'payment-failed',
      reason: null,
      data: {
        number: 'LO-26-999999',
        customerName: 'Test',
        orderUrl: 'http://localhost:3000/order/LO-26-999999?token=x',
        paymentProvider: 'mock',
        awaitingPrescription: false,
        items: [],
        totals: {
          subtotalMinor: 0,
          discountMinor: 0,
          shippingMinor: 0,
          codFeeMinor: 0,
          taxMinor: 0,
          totalMinor: 0,
          taxName: 'GST',
        },
        delivery: null,
        address: [],
      },
    });
    // Fails only for this test's email; other tests' emails share the outbox.
    const provider = {
      send: (email: { to: string }) =>
        email.to === to ? Promise.reject(new Error('SMTP unavailable')) : Promise.resolve(),
    };
    let now = Date.now();
    for (let attempt = 1; attempt <= MAX_EMAIL_ATTEMPTS; attempt += 1) {
      await dispatchOutbox(context.db, provider, { now: new Date(now), limit: 500 });
      const row = await context.db.emailOutbox.findFirstOrThrow({ where: { to } });
      expect(row.attempts).toBe(attempt);
      expect(row.sendAfter.getTime()).toBe(now + 2 ** (attempt - 1) * 60_000);
      now = row.sendAfter.getTime();
    }
    const row = await context.db.emailOutbox.findFirstOrThrow({ where: { to } });
    expect(row).toMatchObject({ status: 'FAILED', lastError: 'SMTP unavailable' });
  });

  it('is drained by the worker job', async () => {
    const email = new MemoryEmailProvider();
    await runOutbox({ db: context.db, email } as unknown as JobContext);
    expect(
      await context.db.emailOutbox.count({
        where: { status: 'PENDING', sendAfter: { lte: new Date() } },
      }),
    ).toBe(0);
  });
});

describe('payment reconciliation', () => {
  it('settles a payment whose webhook never arrived', async () => {
    const placed = await placeMockOrder();
    const payment = await context.db.payment.findFirstOrThrow({
      where: { order: { number: placed.order.number } },
    });
    await context.mockBank.set(payment.providerRef ?? '', {
      outcome: 'succeeded',
      failureReason: null,
      settlesAt: null,
    });
    await context.db.payment.update({
      where: { id: payment.id },
      data: { createdAt: new Date(Date.now() - 10 * 60_000) },
    });

    expect(await runReconcile({ gateway } as unknown as JobContext)).toBeGreaterThanOrEqual(1);
    const order = await context.db.order.findUniqueOrThrow({
      where: { number: placed.order.number },
    });
    expect(order.status).toBe('PAID');
  });
});

describe('stock hold expiry', () => {
  it('waits while the bank is still confirming a payment', async () => {
    const placed = await placeMockOrder();
    const order = await context.db.order.findUniqueOrThrow({
      where: { number: placed.order.number },
      include: { payments: true },
    });
    await context.db.payment.update({
      where: { id: order.payments[0]?.id ?? '' },
      data: { status: 'PENDING' },
    });
    await context.db.stockReservation.updateMany({
      where: { orderId: order.id },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    await expireHolds(context.db, quiet);
    expect((await context.db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      'PENDING_PAYMENT',
    );

    // Two hours later the hold is released after all.
    await expireHolds(context.db, quiet, new Date(Date.now() + 3 * 60 * 60_000));
    expect((await context.db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      'CANCELLED',
    );
  });

  it('runs as a worker job', async () => {
    const result = await runReservations({ db: context.db, log: quiet } as unknown as JobContext);
    expect(result).toEqual(expect.objectContaining({ released: expect.any(Number) }));
  });
});
