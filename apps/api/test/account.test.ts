import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  AuthSession,
  OrderList,
  ReorderResult,
  SavedAddress,
  SavedPrescription,
  Wishlist,
} from '@optical/shared/account';
import type { Cart, CheckoutQuote, OrderView, PlacedOrder } from '@optical/shared/checkout';
import { buildMockWebhook } from '../src/modules/payments/mock';
import { remindExpiringPrescriptions } from '../src/modules/account/reminders';
import { baseTestEnv, buildDbTestApp } from './helpers';
import { PASSWORD, signUp, uniqueEmail } from './accounts';
import { deliveryAddress, stockedVariant, TestBrowser } from './browser';

let context: Awaited<ReturnType<typeof buildDbTestApp>>;
let frame: Awaited<ReturnType<typeof stockedVariant>>;

beforeAll(async () => {
  context = await buildDbTestApp({ env: { LOG_LEVEL: process.env.DEBUG_LOG ?? 'silent' } });
  frame = await stockedVariant(context.db, 'harbour');
});
afterAll(async () => {
  await context.app.close();
});

const rx = {
  right: { sph: -1.75, cyl: -0.5, axis: 180, add: null },
  left: { sph: -1.5, cyl: null, axis: null, add: null },
  pd: { kind: 'single', value: 62 },
};
const singleVision = (prescription: unknown) => ({
  purpose: 'single-vision',
  prescription,
  indexCode: '1.61',
  packageCode: 'complete',
});

async function placeOrder(browser: TestBrowser, email: string, provider = 'mock', extra = {}) {
  const quote = (
    await browser.post('/v1/checkout/quote', {
      shippingSpeed: 'standard',
      postalCode: deliveryAddress.postalCode,
      paymentProvider: provider,
      email,
    })
  ).json<CheckoutQuote>();
  const response = await browser.post(
    '/v1/checkout/orders',
    {
      contact: { email, phone: '98450 12345' },
      address: deliveryAddress,
      shippingSpeed: 'standard',
      paymentProvider: provider,
      expectedTotalMinor: quote.pricing.totalMinor,
      ...extra,
    },
    { 'idempotency-key': crypto.randomUUID() },
  );
  expect(response.statusCode, response.body).toBe(201);
  return response.json<PlacedOrder>();
}

async function pay(browser: TestBrowser, placed: PlacedOrder) {
  const paymentId = placed.payment?.kind === 'mock' ? placed.payment.paymentId : '';
  await browser.post('/v1/payments/mock/simulate', { paymentId, outcome: 'success' });
  for (const { job } of context.jobs.mockWebhooks.splice(0)) {
    const { body, headers } = buildMockWebhook(baseTestEnv.APP_SECRET, job);
    await context.app.inject({ method: 'POST', url: '/v1/webhooks/mock', headers, payload: body });
  }
}

describe('orders in the account', () => {
  it('links orders to the account, lists them, and opens them without a token', async () => {
    const { browser, email } = await signUp(context.app);
    await browser.post('/v1/cart/items', { variantId: frame.id });
    const placed = await placeOrder(browser, email, 'mock', { saveAddress: true });
    const list = (await browser.get('/v1/account/orders')).json<OrderList>();
    expect(list.total).toBe(1);
    expect(list.items[0]).toMatchObject({ number: placed.order.number, itemCount: 1 });

    const view = await browser.get(`/v1/orders/${placed.order.number}`);
    expect(view.statusCode).toBe(200);
    expect(view.json<OrderView>().actions).toMatchObject({ cancel: true, invoice: false });

    // The checkout address was saved, as the default.
    const addresses = (await browser.get('/v1/account/addresses')).json<SavedAddress[]>();
    expect(addresses).toHaveLength(1);
    expect(addresses[0]).toMatchObject({ city: 'Bengaluru', isDefault: true });

    // Another account (or a guest) can't see it.
    const other = await signUp(context.app);
    expect((await other.browser.get(`/v1/orders/${placed.order.number}`)).statusCode).toBe(404);
    expect(
      (await new TestBrowser(context.app).get(`/v1/orders/${placed.order.number}`)).statusCode,
    ).toBe(404);
  });

  it('cancels a paid order: stock back, refund sent, email queued', async () => {
    const { browser, email } = await signUp(context.app);
    await browser.post('/v1/cart/items', { variantId: frame.id });
    const placed = await placeOrder(browser, email);
    await pay(browser, placed);
    const before = await context.db.stockItem.findUniqueOrThrow({ where: { variantId: frame.id } });

    const invoice = await browser.get(`/v1/orders/${placed.order.number}/invoice`);
    expect(invoice.statusCode).toBe(200);
    expect(invoice.headers['content-type']).toBe('application/pdf');
    expect(invoice.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');

    const response = await browser.post(`/v1/orders/${placed.order.number}/cancel`, {
      note: 'Ordered the wrong colour',
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json<OrderView>().status).toBe('REFUNDED');
    const after = await context.db.stockItem.findUniqueOrThrow({ where: { variantId: frame.id } });
    expect(after.onHand).toBe(before.onHand + 1);
    const refund = await context.db.refund.findFirstOrThrow({
      where: { order: { number: placed.order.number } },
    });
    expect(refund.status).toBe('SUCCEEDED');
    expect(
      await context.db.emailOutbox.count({ where: { to: email, template: 'order-cancelled' } }),
    ).toBe(1);
    // Twice is refused.
    expect((await browser.post(`/v1/orders/${placed.order.number}/cancel`, {})).statusCode).toBe(
      409,
    );
  });

  it('accepts a return only after delivery, within the window', async () => {
    const { browser, email } = await signUp(context.app);
    await browser.post('/v1/cart/items', { variantId: frame.id });
    const placed = await placeOrder(browser, email, 'cod');
    const number = placed.order.number;
    expect((await browser.post(`/v1/orders/${number}/return`, { reason: 'fit' })).statusCode).toBe(
      409,
    );

    const order = await context.db.order.findUniqueOrThrow({ where: { number } });
    await context.db.order.update({ where: { id: order.id }, data: { status: 'DELIVERED' } });
    await context.db.orderEvent.create({
      data: { orderId: order.id, fromStatus: 'SHIPPED', toStatus: 'DELIVERED' },
    });
    const view = (await browser.get(`/v1/orders/${number}`)).json<OrderView>();
    expect(view.actions).toMatchObject({ requestReturn: true, invoice: true, cancel: false });

    const response = await browser.post(`/v1/orders/${number}/return`, {
      reason: 'style',
      note: 'Too wide for me',
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json<OrderView>().status).toBe('RETURN_REQUESTED');
    const outbox = await context.db.emailOutbox.findFirstOrThrow({
      where: { to: email, template: 'return-update' },
    });
    expect(outbox.payload).toMatchObject({ data: { stage: 'requested' } });
  });

  it('reorders into the bag, reusing the saved prescription', async () => {
    const { browser, email } = await signUp(context.app);
    await browser.post('/v1/cart/items', {
      variantId: frame.id,
      lensConfig: singleVision({ mode: 'manual', rx }),
    });
    const placed = await placeOrder(browser, email, 'cod');
    expect((await browser.get('/v1/cart')).json<Cart>().itemCount).toBe(0);

    const response = await browser.post(`/v1/orders/${placed.order.number}/reorder`);
    expect(response.json<ReorderResult>()).toEqual({ added: 1, skipped: [] });
    const cart = (await browser.get('/v1/cart')).json<Cart>();
    expect(cart.items[0]?.lensConfig?.prescription?.mode).toBe('saved');
  });
});

describe('saved prescriptions', () => {
  it('saves, versions and expires prescriptions, and uses them in the bag', async () => {
    const { browser } = await signUp(context.app);
    const created = await browser.post('/v1/account/prescriptions', {
      label: 'Everyday',
      rx,
      prescribedAt: '2025-01-10',
    });
    expect(created.statusCode, created.body).toBe(201);
    const saved = created.json<SavedPrescription>();
    expect(saved).toMatchObject({ version: 1, expiresAt: '2027-01-10', expiry: 'valid' });

    const invalid = await browser.post('/v1/account/prescriptions', {
      label: 'Broken',
      rx: { ...rx, right: { sph: -1, cyl: -1, axis: null, add: null } },
    });
    expect(invalid.statusCode).toBe(422);

    const updated = await browser.request('PUT', `/v1/account/prescriptions/${saved.id}`, {
      body: {
        label: 'Everyday',
        rx: { ...rx, left: { ...rx.left, sph: -1.75 } },
        expiresAt: '2026-10-20',
      },
    });
    expect(updated.statusCode, updated.body).toBe(200);
    const list = (await browser.get('/v1/account/prescriptions')).json<SavedPrescription[]>();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ version: 2, history: [{ id: saved.id, version: 1 }] });
    // Editing an old version is refused.
    const stale = await browser.request('PUT', `/v1/account/prescriptions/${saved.id}`, {
      body: { label: 'Everyday', rx },
    });
    expect(stale.statusCode).toBe(409);

    const latest = list[0]!;
    const added = await browser.post('/v1/cart/items', {
      variantId: frame.id,
      lensConfig: singleVision({ mode: 'saved', prescriptionId: latest.id }),
    });
    expect(added.statusCode, added.body).toBe(200);

    // Someone else's prescription can't be used.
    const other = await signUp(context.app);
    const stolen = await other.browser.post('/v1/cart/items', {
      variantId: frame.id,
      lensConfig: singleVision({ mode: 'saved', prescriptionId: latest.id }),
    });
    expect(stolen.statusCode).toBe(422);

    const removed = await browser.request('DELETE', `/v1/account/prescriptions/${latest.id}`);
    expect(removed.json<SavedPrescription[]>()).toEqual([]);
    const rows = await context.db.prescription.findMany({
      where: { id: { in: [saved.id, latest.id] } },
    });
    expect(rows.every((row) => row.deletedAt !== null && row.values === null)).toBe(true);
  });

  it('sends one reminder for a prescription about to expire', async () => {
    const { browser, email } = await signUp(context.app);
    const soon = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    await browser.post('/v1/account/prescriptions', { label: 'Reading', rx, expiresAt: soon });
    const siteUrl = 'http://localhost:3000';
    expect(await remindExpiringPrescriptions(context.db, { siteUrl })).toBeGreaterThanOrEqual(1);
    expect(await remindExpiringPrescriptions(context.db, { siteUrl })).toBe(0);
    const outbox = await context.db.emailOutbox.findMany({
      where: { to: email, template: 'prescription-expiring' },
    });
    expect(outbox).toHaveLength(1);
  });
});

describe('addresses', () => {
  it('keeps exactly one default and isolates accounts', async () => {
    const { browser } = await signUp(context.app);
    const input = { ...deliveryAddress, phone: '98450 12345' };
    const first = (await browser.post('/v1/account/addresses', input)).json<SavedAddress>();
    const second = (
      await browser.post('/v1/account/addresses', { ...input, line1: '7 MG Road', isDefault: true })
    ).json<SavedAddress>();
    let list = (await browser.get('/v1/account/addresses')).json<SavedAddress[]>();
    expect(list.filter((address) => address.isDefault).map((address) => address.id)).toEqual([
      second.id,
    ]);

    list = (await browser.request('DELETE', `/v1/account/addresses/${second.id}`)).json<
      SavedAddress[]
    >();
    expect(list).toEqual([expect.objectContaining({ id: first.id, isDefault: true })]);

    const other = await signUp(context.app);
    const response = await other.browser.request('PUT', `/v1/account/addresses/${first.id}`, {
      body: input,
    });
    expect(response.statusCode).toBe(404);
    expect((await new TestBrowser(context.app).get('/v1/account/addresses')).statusCode).toBe(401);
  });
});

describe('wishlist', () => {
  it('merges the browser list, syncs changes and shares a read-only link', async () => {
    const product = await context.db.product.findFirstOrThrow({ where: { slug: 'linden' } });
    const another = await context.db.product.findFirstOrThrow({ where: { slug: 'marlow' } });
    const { browser } = await signUp(context.app);
    const merged = await browser.post('/v1/account/wishlist/merge', {
      items: [
        { id: product.id, slug: product.slug },
        { id: crypto.randomUUID(), slug: 'gone' },
      ],
    });
    expect(merged.json<Wishlist>().items).toEqual([{ id: product.id, slug: 'linden' }]);
    const added = await browser.request('PUT', `/v1/account/wishlist/items/${another.id}`);
    const list = added.json<Wishlist>();
    expect(list.items).toHaveLength(2);

    const shared = await new TestBrowser(context.app).get(`/v1/wishlists/${list.shareToken}`);
    expect(shared.statusCode).toBe(200);
    expect(shared.json<{ items: unknown[] }>().items).toHaveLength(2);
    expect(shared.body).not.toContain('Meera');

    const reset = (await browser.post('/v1/account/wishlist/share')).json<Wishlist>();
    expect(reset.shareToken).not.toBe(list.shareToken);
    expect(
      (await new TestBrowser(context.app).get(`/v1/wishlists/${list.shareToken}`)).statusCode,
    ).toBe(404);
  });
});

describe('account after a guest order', () => {
  it('creates an account from the order with one password and moves the order in', async () => {
    const guest = new TestBrowser(context.app);
    const email = uniqueEmail('guest');
    await guest.post('/v1/cart/items', { variantId: frame.id });
    const placed = await placeOrder(guest, email, 'cod');
    const wrongToken = await guest.post('/v1/auth/register-from-order', {
      number: placed.order.number,
      token: 'x'.repeat(43),
      password: PASSWORD,
    });
    expect(wrongToken.statusCode).toBe(404);
    const response = await guest.post('/v1/auth/register-from-order', {
      number: placed.order.number,
      token: placed.accessToken,
      password: PASSWORD,
    });
    expect(response.statusCode, response.body).toBe(201);
    expect(response.json<AuthSession>().user).toMatchObject({ email, name: 'Asha Kulkarni' });
    const list = (await guest.get('/v1/account/orders')).json<OrderList>();
    expect(list.items.map((item) => item.number)).toEqual([placed.order.number]);
  });
});

describe('data export', () => {
  it('exports the profile, addresses, orders and wishlist', async () => {
    const { browser, email } = await signUp(context.app);
    await browser.post('/v1/account/addresses', { ...deliveryAddress, phone: '98450 12345' });
    const response = await browser.get('/v1/account/export');
    expect(response.headers['content-disposition']).toContain('attachment');
    const data = response.json<{ profile: { email: string }; addresses: unknown[] }>();
    expect(data.profile.email).toBe(email);
    expect(data.addresses).toHaveLength(1);
  });
});
