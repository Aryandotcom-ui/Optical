import type { CheckoutQuote, OrderView, PlacedOrder } from '@optical/shared/checkout';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dispatchOutbox } from '../src/infra/email/outbox';
import { MemoryEmailProvider } from '../src/infra/email/provider';
import { buildMockWebhook } from '../src/modules/payments/mock';
import { deliveryAddress, stockedVariant, TestBrowser } from './browser';
import { baseTestEnv, buildDbTestApp } from './helpers';

let context: Awaited<ReturnType<typeof buildDbTestApp>>;
let frame: Awaited<ReturnType<typeof stockedVariant>>;

beforeAll(async () => {
  context = await buildDbTestApp();
  frame = await stockedVariant(context.db, 'gale');
});
afterAll(async () => {
  await context.app.close();
});

const contact = { email: 'checkout.tester@example.com', phone: '98765 43210' };

async function bagWithFrame(quantity = 1) {
  const browser = new TestBrowser(context.app);
  await browser.post('/v1/cart/items', { variantId: frame.id, quantity });
  return browser;
}

async function quote(browser: TestBrowser, provider = 'mock') {
  const response = await browser.post('/v1/checkout/quote', {
    shippingSpeed: 'standard',
    postalCode: deliveryAddress.postalCode,
    paymentProvider: provider,
    email: contact.email,
  });
  return response.json<CheckoutQuote>();
}

async function placeOrder(browser: TestBrowser, provider = 'mock', key = crypto.randomUUID()) {
  const { pricing } = await quote(browser, provider);
  return browser.post(
    '/v1/checkout/orders',
    {
      contact,
      address: deliveryAddress,
      shippingSpeed: 'standard',
      paymentProvider: provider,
      expectedTotalMinor: pricing.totalMinor,
    },
    { 'idempotency-key': key },
  );
}

/** Delivers the webhooks the mock provider queued, as the worker would. */
async function deliverMockWebhooks() {
  const queued = context.jobs.mockWebhooks.splice(0);
  for (const { job } of queued) {
    const { body, headers } = buildMockWebhook(baseTestEnv.APP_SECRET, job);
    const response = await context.app.inject({
      method: 'POST',
      url: '/v1/webhooks/mock',
      headers,
      payload: body,
    });
    expect(response.statusCode).toBe(200);
  }
  return queued;
}

async function viewOrder(browser: TestBrowser, placed: PlacedOrder) {
  return (
    await browser.get(`/v1/orders/${placed.order.number}`, { 'x-order-token': placed.accessToken })
  ).json<OrderView>();
}

async function simulate(browser: TestBrowser, placed: PlacedOrder, outcome: string) {
  const paymentId = placed.payment?.kind === 'mock' ? placed.payment.paymentId : '';
  return browser.post(
    '/v1/payments/mock/simulate',
    { paymentId, outcome },
    { 'x-order-token': placed.accessToken },
  );
}

const stockOf = async (variantId: string) =>
  context.db.stockItem.findUniqueOrThrow({ where: { variantId } });

describe('checkout quote', () => {
  it('prices delivery, dates and payment methods', async () => {
    const browser = await bagWithFrame();
    const result = await quote(browser);
    expect(result.pricing.totalMinor).toBe(frame.priceMinor);
    expect(result.delivery.standard.earliest <= result.delivery.standard.latest).toBe(true);
    expect(result.delivery.express.earliest <= result.delivery.standard.earliest).toBe(true);
    expect(result.paymentOptions.map((option) => option.provider)).toEqual(['mock', 'cod']);
    expect(result.paymentOptions.find((option) => option.provider === 'cod')).toMatchObject({
      available: true,
      feeMinor: 49_00,
    });
  });

  it('says the bag is empty', async () => {
    const response = await new TestBrowser(context.app).post('/v1/checkout/quote', {});
    expect(response.statusCode).toBe(409);
  });
});

describe('placing an order', () => {
  it('needs an idempotency key and the agreed total', async () => {
    const browser = await bagWithFrame();
    const noKey = await browser.post('/v1/checkout/orders', {
      contact,
      address: deliveryAddress,
      shippingSpeed: 'standard',
      paymentProvider: 'mock',
      expectedTotalMinor: frame.priceMinor,
    });
    expect(noKey.statusCode).toBe(400);
    const wrongTotal = await browser.post(
      '/v1/checkout/orders',
      {
        contact,
        address: deliveryAddress,
        shippingSpeed: 'standard',
        paymentProvider: 'mock',
        expectedTotalMinor: 1,
      },
      { 'idempotency-key': crypto.randomUUID() },
    );
    expect(wrongTotal.statusCode).toBe(409);
    expect(wrongTotal.json()).toMatchObject({ error: { code: 'PRICE_CHANGED' } });
  });

  it('validates the address and contact in plain language', async () => {
    const browser = await bagWithFrame();
    const response = await browser.post(
      '/v1/checkout/orders',
      {
        contact: { email: 'not-an-email', phone: '123' },
        address: { ...deliveryAddress, postalCode: '00000' },
        shippingSpeed: 'standard',
        paymentProvider: 'mock',
        expectedTotalMinor: frame.priceMinor,
      },
      { 'idempotency-key': crypto.randomUUID() },
    );
    expect(response.statusCode).toBe(422);
    const paths = response
      .json<{ error: { details: { path: string }[] } }>()
      .error.details.map((d) => d.path);
    expect(paths).toEqual(['body.contact.email', 'body.contact.phone', 'body.address.postalCode']);
  });

  it('holds stock, takes a mock payment by webhook and confirms by email', async () => {
    const browser = await bagWithFrame();
    const before = await stockOf(frame.id);
    const key = crypto.randomUUID();
    const response = await placeOrder(browser, 'mock', key);
    expect(response.statusCode).toBe(201);
    const placed = response.json<PlacedOrder>();
    expect(placed.order).toMatchObject({
      status: 'PENDING_PAYMENT',
      canRetryPayment: true,
      email: contact.email,
    });
    expect(placed.order.number).toMatch(/^LO-\d{2}-\d{6}$/);
    expect(placed.order.shippingAddress.phone).toBe('+919876543210');
    expect(placed.payment).toMatchObject({ kind: 'mock' });
    expect(placed.order.reservedUntil).not.toBeNull();
    expect((await stockOf(frame.id)).reserved).toBe(before.reserved + 1);

    // Repeating the request returns the same order; a different body under the same key is refused.
    const again = await placeOrder(browser, 'mock', key);
    expect(again.json<PlacedOrder>().order.number).toBe(placed.order.number);

    expect((await simulate(browser, placed, 'success')).statusCode).toBe(200);
    expect(context.jobs.mockWebhooks).toHaveLength(1);
    await deliverMockWebhooks();

    const paid = await viewOrder(browser, placed);
    expect(paid).toMatchObject({
      status: 'PAID',
      statusLabel: 'Order confirmed',
      payment: { status: 'SUCCEEDED' },
    });
    expect(paid.timeline.map((step) => step.status)).toEqual(['PENDING_PAYMENT', 'PAID']);
    expect(paid.upcoming.map((step) => step.status)).toEqual(['SHIPPED', 'DELIVERED']);
    const after = await stockOf(frame.id);
    expect(after).toMatchObject({ onHand: before.onHand - 1, reserved: before.reserved });
    expect((await browser.get('/v1/cart')).json<{ itemCount: number }>().itemCount).toBe(0);

    const order = await context.db.order.findUniqueOrThrow({
      where: { number: placed.order.number },
    });
    const email = new MemoryEmailProvider();
    await dispatchOutbox(context.db, email, { limit: 100 });
    const confirmation = email.sent.find(
      (sent) => sent.subject === `Order ${order.number} confirmed`,
    );
    expect(confirmation?.to).toBe(contact.email);
    expect(confirmation?.html).toContain(placed.accessToken);
    expect(confirmation?.text).toContain('Estimated delivery');
  });

  it('acknowledges a repeated webhook without applying it twice', async () => {
    const browser = await bagWithFrame();
    const placed = (await placeOrder(browser)).json<PlacedOrder>();
    await simulate(browser, placed, 'success');
    const [queued] = context.jobs.mockWebhooks.splice(0);
    if (!queued) throw new Error('no webhook queued');
    const { body, headers } = buildMockWebhook(baseTestEnv.APP_SECRET, queued.job);
    const send = () =>
      context.app.inject({ method: 'POST', url: '/v1/webhooks/mock', headers, payload: body });
    expect((await send()).json()).toEqual({ received: 1, duplicates: 0 });
    expect((await send()).json()).toEqual({ received: 1, duplicates: 1 });
    const events = await context.db.orderEvent.count({
      where: { order: { number: placed.order.number }, toStatus: 'PAID' },
    });
    expect(events).toBe(1);
  });

  it('rejects forged and replayed webhooks', async () => {
    const job = { eventId: 'evt_forged', paymentRef: 'mock_x', outcome: 'succeeded' as const };
    const forged = buildMockWebhook('a-different-secret-that-is-long-enough', job);
    const forgedResponse = await context.app.inject({
      method: 'POST',
      url: '/v1/webhooks/mock',
      headers: forged.headers,
      payload: forged.body,
    });
    expect(forgedResponse.statusCode).toBe(401);

    const old = buildMockWebhook(baseTestEnv.APP_SECRET, job, Date.now() - 10 * 60_000);
    const replay = await context.app.inject({
      method: 'POST',
      url: '/v1/webhooks/mock',
      headers: old.headers,
      payload: old.body,
    });
    expect(replay.statusCode).toBe(401);
    expect(replay.json()).toMatchObject({ error: { message: 'Webhook timestamp is too old.' } });

    const tampered = buildMockWebhook(baseTestEnv.APP_SECRET, job);
    const changed = await context.app.inject({
      method: 'POST',
      url: '/v1/webhooks/mock',
      headers: tampered.headers,
      payload: tampered.body.replace('succeeded', 'failed'),
    });
    expect(changed.statusCode).toBe(401);
  });

  it('lets a failed payment be retried, and emails about the failure', async () => {
    const browser = await bagWithFrame();
    const placed = (await placeOrder(browser)).json<PlacedOrder>();
    await simulate(browser, placed, 'failure');
    await deliverMockWebhooks();
    const failed = await viewOrder(browser, placed);
    expect(failed).toMatchObject({
      status: 'PAYMENT_FAILED',
      canRetryPayment: true,
      payment: { status: 'FAILED', failureReason: 'The bank declined the payment (simulated).' },
    });
    const outbox = await context.db.emailOutbox.findFirst({
      where: {
        template: 'payment-failed',
        payload: { path: ['data', 'number'], equals: placed.order.number },
      },
    });
    expect(outbox).not.toBeNull();
    // The bag is kept until payment succeeds.
    expect((await browser.get('/v1/cart')).json<{ itemCount: number }>().itemCount).toBe(1);

    const retry = await browser.post(
      `/v1/orders/${placed.order.number}/payment`,
      { provider: 'mock' },
      { 'x-order-token': placed.accessToken },
    );
    expect(retry.statusCode).toBe(200);
    const retried = retry.json<PlacedOrder>();
    expect(retried.order.status).toBe('PENDING_PAYMENT');
    await simulate(browser, retried, 'success');
    await deliverMockWebhooks();
    expect((await viewOrder(browser, placed)).status).toBe('PAID');
  });

  it('shows a pending payment as processing until the bank confirms', async () => {
    const browser = await bagWithFrame();
    const placed = (await placeOrder(browser)).json<PlacedOrder>();
    await simulate(browser, placed, 'pending');
    const queued = context.jobs.mockWebhooks.map((entry) => [entry.job.outcome, entry.delayMs]);
    expect(queued).toEqual([
      ['pending', 300],
      ['succeeded', 30_000],
    ]);
    const [first, second] = context.jobs.mockWebhooks.splice(0);
    context.jobs.mockWebhooks.push(first!);
    await deliverMockWebhooks();
    const processing = await viewOrder(browser, placed);
    expect(processing).toMatchObject({
      status: 'PENDING_PAYMENT',
      statusLabel: 'Payment processing',
      canRetryPayment: false,
    });
    context.jobs.mockWebhooks.push(second!);
    await deliverMockWebhooks();
    expect((await viewOrder(browser, placed)).status).toBe('PAID');
  });

  it('only lets the order holder simulate its payment', async () => {
    const browser = await bagWithFrame();
    const placed = (await placeOrder(browser)).json<PlacedOrder>();
    const stranger = await simulate(browser, { ...placed, accessToken: 'wrong' }, 'success');
    expect(stranger.statusCode).toBe(404);
  });
});

describe('cash on delivery', () => {
  it('confirms at once, takes the stock and adds the fee', async () => {
    const browser = await bagWithFrame();
    const before = await stockOf(frame.id);
    const response = await placeOrder(browser, 'cod');
    expect(response.statusCode).toBe(201);
    const placed = response.json<PlacedOrder>();
    expect(placed.payment).toEqual({ kind: 'none' });
    expect(placed.order).toMatchObject({
      status: 'PENDING_PAYMENT',
      statusLabel: 'Order confirmed',
      canRetryPayment: false,
      reservedUntil: null,
      totals: { codFeeMinor: 49_00, totalMinor: frame.priceMinor + 49_00 },
    });
    expect((await stockOf(frame.id)).onHand).toBe(before.onHand - 1);
    expect((await browser.get('/v1/cart')).json<{ itemCount: number }>().itemCount).toBe(0);
  });

  it('is refused above the order limit', async () => {
    const browser = new TestBrowser(context.app);
    const expensive = await stockedVariant(context.db, 'vale');
    await browser.post('/v1/cart/items', { variantId: expensive.id, quantity: 2 });
    const result = await quote(browser, 'cod');
    expect(result.paymentOptions.find((option) => option.provider === 'cod')).toMatchObject({
      available: false,
      reason: expect.stringContaining('₹15,000'),
    });
    const response = await browser.post(
      '/v1/checkout/orders',
      {
        contact,
        address: deliveryAddress,
        shippingSpeed: 'standard',
        paymentProvider: 'cod',
        expectedTotalMinor: result.pricing.totalMinor,
      },
      { 'idempotency-key': crypto.randomUUID() },
    );
    expect(response.statusCode).toBe(422);
  });
});

describe('order pages', () => {
  it('need the access token, or the number and email', async () => {
    const browser = await bagWithFrame();
    const placed = (await placeOrder(browser)).json<PlacedOrder>();
    const anonymous = new TestBrowser(context.app);
    expect((await anonymous.get(`/v1/orders/${placed.order.number}`)).statusCode).toBe(404);
    expect(
      (
        await anonymous.get(`/v1/orders/${placed.order.number}`, {
          'x-order-token': 'x'.repeat(43),
        })
      ).statusCode,
    ).toBe(404);

    const wrongEmail = await anonymous.post('/v1/orders/track', {
      number: placed.order.number,
      email: 'someone@example.com',
    });
    expect(wrongEmail.statusCode).toBe(404);
    const tracked = await anonymous.post('/v1/orders/track', {
      number: placed.order.number.toLowerCase(),
      email: contact.email.toUpperCase(),
    });
    expect(tracked.statusCode).toBe(200);
    expect(tracked.json()).toMatchObject({
      order: { number: placed.order.number },
      accessToken: placed.accessToken,
    });
  });
});

describe('stock holds', () => {
  it('cancel unpaid orders when the hold expires and give the coupon back', async () => {
    const browser = await bagWithFrame();
    await browser.request('PUT', '/v1/cart/coupon', { body: { code: 'FREESHIP' } });
    const before = await stockOf(frame.id);
    const placed = (await placeOrder(browser)).json<PlacedOrder>();
    const coupon = await context.db.coupon.findUniqueOrThrow({ where: { code: 'FREESHIP' } });
    const order = await context.db.order.findUniqueOrThrow({
      where: { number: placed.order.number },
    });
    await context.db.stockReservation.updateMany({
      where: { orderId: order.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const { expireHolds } = await import('../src/modules/orders/expiry');
    const result = await expireHolds(context.db, { info: () => undefined });
    expect(result.cancelled).toBeGreaterThanOrEqual(1);

    const cancelled = await viewOrder(browser, placed);
    expect(cancelled).toMatchObject({
      status: 'CANCELLED',
      canRetryPayment: false,
      reservedUntil: null,
    });
    expect((await stockOf(frame.id)).reserved).toBe(before.reserved);
    const couponAfter = await context.db.coupon.findUniqueOrThrow({ where: { code: 'FREESHIP' } });
    expect(couponAfter.usageCount).toBe(coupon.usageCount - 1);

    // A payment that lands afterwards is refunded, not silently kept.
    await simulate(browser, placed, 'success');
    await deliverMockWebhooks();
    expect(await context.db.refund.count({ where: { orderId: order.id } })).toBe(1);
  });
});
