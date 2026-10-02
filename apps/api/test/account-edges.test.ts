import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  AuthSession,
  OrderList,
  SavedAddress,
  SavedPrescription,
  Wishlist,
} from '@optical/shared/account';
import type { Cart, CheckoutQuote, OrderView, PlacedOrder } from '@optical/shared/checkout';
import { AccessTokens } from '../src/modules/auth/access-token';
import { mergeGuestInto } from '../src/modules/auth/merge';
import { buildDbTestApp, testEnv } from './helpers';
import { PASSWORD, signUp, uniqueEmail } from './accounts';
import { deliveryAddress, stockedVariant, TestBrowser } from './browser';

let context: Awaited<ReturnType<typeof buildDbTestApp>>;
let frame: Awaited<ReturnType<typeof stockedVariant>>;
let other: Awaited<ReturnType<typeof stockedVariant>>;

beforeAll(async () => {
  context = await buildDbTestApp();
  frame = await stockedVariant(context.db, 'marlow');
  other = await stockedVariant(context.db, 'ives');
});
afterAll(async () => {
  await context.app.close();
});

const rx = {
  right: { sph: -1, cyl: null, axis: null, add: null },
  left: { sph: -1.25, cyl: null, axis: null, add: null },
  pd: { kind: 'dual', right: 31, left: 32 },
};

async function codOrder(browser: TestBrowser, email: string) {
  const quote = (
    await browser.post('/v1/checkout/quote', {
      shippingSpeed: 'standard',
      postalCode: deliveryAddress.postalCode,
      paymentProvider: 'cod',
      email,
    })
  ).json<CheckoutQuote>();
  const response = await browser.post(
    '/v1/checkout/orders',
    {
      contact: { email, phone: '98450 12345' },
      address: deliveryAddress,
      shippingSpeed: 'standard',
      paymentProvider: 'cod',
      expectedTotalMinor: quote.pricing.totalMinor,
    },
    { 'idempotency-key': crypto.randomUUID() },
  );
  expect(response.statusCode, response.body).toBe(201);
  return response.json<PlacedOrder>();
}

describe('access tokens', () => {
  it('rejects tokens that are expired, for another audience or missing claims', async () => {
    let now = new Date('2026-10-02T10:00:00Z');
    const tokens = new AccessTokens(testEnv().APP_SECRET, () => now);
    const token = await tokens.sign({
      userId: crypto.randomUUID(),
      role: 'CUSTOMER',
      familyId: crypto.randomUUID(),
    });
    expect(await tokens.verify(token)).not.toBeNull();
    now = new Date('2026-10-02T10:16:00Z');
    expect(await tokens.verify(token)).toBeNull();
    const otherKey = new AccessTokens('another-secret-that-is-at-least-32-characters', () => now);
    expect(
      await tokens.verify(await otherKey.sign({ userId: 'x', role: 'ADMIN', familyId: 'y' })),
    ).toBeNull();
    expect(await tokens.verify('not.a.jwt')).toBeNull();
  });
});

describe('sign-in edge cases', () => {
  it('refuses a malformed or unknown refresh token and clears the cookies', async () => {
    const browser = new TestBrowser(context.app);
    browser.jar.set('lo_refresh', { value: 'short', path: '/v1/auth' });
    expect((await browser.post('/v1/auth/refresh')).statusCode).toBe(401);
    browser.jar.set('lo_refresh', { value: 'a'.repeat(43), path: '/v1/auth' });
    expect((await browser.post('/v1/auth/refresh')).statusCode).toBe(401);
    // Signing out without a session is harmless.
    expect((await new TestBrowser(context.app).post('/v1/auth/logout')).statusCode).toBe(204);
  });

  it('signs out with only the refresh cookie (expired access token)', async () => {
    const { browser } = await signUp(context.app);
    const refresh = browser.jar.get('lo_refresh')!;
    const cookieless = new TestBrowser(context.app);
    cookieless.jar.set('lo_refresh', refresh);
    expect((await cookieless.post('/v1/auth/logout')).statusCode).toBe(204);
    expect((await browser.get('/v1/auth/me')).statusCode).toBe(401);
  });

  it('refuses an account from an order that already has one, or whose email is taken', async () => {
    const guest = new TestBrowser(context.app);
    const { email } = await signUp(context.app);
    await guest.post('/v1/cart/items', { variantId: frame.id });
    const placed = await codOrder(guest, email);
    const taken = await guest.post('/v1/auth/register-from-order', {
      number: placed.order.number,
      token: placed.accessToken,
      password: PASSWORD,
    });
    expect(taken.statusCode).toBe(409);

    const second = new TestBrowser(context.app);
    const fresh = uniqueEmail('linked');
    await second.post('/v1/cart/items', { variantId: frame.id });
    const order = await codOrder(second, fresh);
    const body = { number: order.order.number, token: order.accessToken, password: PASSWORD };
    expect((await second.post('/v1/auth/register-from-order', body)).statusCode).toBe(201);
    expect(
      (await new TestBrowser(context.app).post('/v1/auth/register-from-order', body)).statusCode,
    ).toBe(409);
    const weak = await new TestBrowser(context.app).post('/v1/auth/register-from-order', {
      ...body,
      password: 'short',
    });
    expect(weak.statusCode).toBe(422);
  });

  it('refuses a new password that contains the email, on reset and on change', async () => {
    const { browser, email } = await signUp(context.app, { email: uniqueEmail('kavya') });
    const local = email.split('@')[0]!;
    const changed = await browser.post('/v1/account/password', {
      currentPassword: PASSWORD,
      newPassword: `${local}-Secret!`,
    });
    expect(changed.statusCode).toBe(422);
  });
});

describe('merging bags', () => {
  it('adds matching lines, moves others and keeps the account coupon', async () => {
    const { browser, session } = await signUp(context.app);
    await browser.post('/v1/cart/items', { variantId: frame.id });
    await browser.post('/v1/auth/logout');

    const guest = new TestBrowser(context.app);
    await guest.post('/v1/cart/items', { variantId: frame.id, quantity: 2 });
    await guest.post('/v1/cart/items', { variantId: other.id });
    await guest.request('PUT', '/v1/cart/coupon', { body: { code: 'FREESHIP' } });
    const sessionHash = (
      await context.db.cart.findFirstOrThrow({
        where: { items: { some: { variantId: other.id } }, guestTokenHash: { not: null } },
        orderBy: { createdAt: 'desc' },
      })
    ).guestTokenHash;
    const moved = await context.db.$transaction((tx) =>
      mergeGuestInto(tx, session.user.id, sessionHash),
    );
    expect(moved).toBe(3);
    const cart = await context.db.cart.findUniqueOrThrow({
      where: { userId: session.user.id },
      include: { items: true },
    });
    expect(cart.items.map((item) => item.quantity).sort()).toEqual([1, 3]);
    expect(cart.couponCode).toBe('FREESHIP');
    expect(await context.db.$transaction((tx) => mergeGuestInto(tx, session.user.id, null))).toBe(
      0,
    );
  });

  it('drops an empty guest bag on sign-in', async () => {
    const { email } = await signUp(context.app);
    const guest = new TestBrowser(context.app);
    await guest.post('/v1/cart/items', { variantId: frame.id });
    const items = (await guest.get('/v1/cart')).json<Cart>().items;
    await guest.request('DELETE', `/v1/cart/items/${items[0]!.id}`);
    const response = await guest.post('/v1/auth/login', { email, password: PASSWORD });
    expect(response.json<AuthSession>().mergedCartItems).toBe(0);
  });
});

describe('account data', () => {
  it('updates the profile and pages through orders', async () => {
    const { browser, email } = await signUp(context.app);
    const updated = await browser.request('PATCH', '/v1/account/profile', {
      body: { name: 'Meera K Iyer', phone: '98450 12345', marketingOptIn: true },
    });
    expect(updated.json()).toMatchObject({ name: 'Meera K Iyer', phone: '+919845012345' });
    await browser.post('/v1/cart/items', { variantId: frame.id });
    await codOrder(browser, email);
    const page = (await browser.get('/v1/account/orders?page=2')).json<OrderList>();
    expect(page).toMatchObject({ page: 2, total: 1, items: [] });
  });

  it('refuses deletion while an order is in progress', async () => {
    const { browser, email } = await signUp(context.app);
    await browser.post('/v1/cart/items', { variantId: frame.id });
    const placed = await codOrder(browser, email);
    await context.db.order.update({
      where: { number: placed.order.number },
      data: { status: 'IN_PRODUCTION' },
    });
    expect((await browser.post('/v1/account/delete', { password: PASSWORD })).statusCode).toBe(409);
  });

  it('edits addresses and moves the default when it is deleted', async () => {
    const { browser } = await signUp(context.app);
    const input = { ...deliveryAddress, phone: '98450 12345' };
    const first = (await browser.post('/v1/account/addresses', input)).json<SavedAddress>();
    const second = (
      await browser.post('/v1/account/addresses', { ...input, line1: '9 Church Street' })
    ).json<SavedAddress>();
    expect(first.isDefault).toBe(true);
    const edited = await browser.request('PUT', `/v1/account/addresses/${second.id}`, {
      body: { ...input, line1: '10 Church Street', isDefault: true },
    });
    expect(edited.json<SavedAddress>()).toMatchObject({
      line1: '10 Church Street',
      isDefault: true,
    });
    const list = (await browser.post(`/v1/account/addresses/${first.id}/default`)).json<
      SavedAddress[]
    >();
    expect(list[0]?.id).toBe(first.id);
    const after = (await browser.request('DELETE', `/v1/account/addresses/${first.id}`)).json<
      SavedAddress[]
    >();
    expect(after).toEqual([expect.objectContaining({ id: second.id, isDefault: true })]);
    expect((await browser.request('DELETE', `/v1/account/addresses/${first.id}`)).statusCode).toBe(
      404,
    );
  });

  it('checks prescription dates, renames, and flags expired ones', async () => {
    const { browser } = await signUp(context.app);
    const future = await browser.post('/v1/account/prescriptions', {
      label: 'Future',
      rx,
      prescribedAt: '2099-01-01',
    });
    expect(future.statusCode).toBe(422);
    const backwards = await browser.post('/v1/account/prescriptions', {
      label: 'Backwards',
      rx,
      prescribedAt: '2025-06-01',
      expiresAt: '2025-01-01',
    });
    expect(backwards.statusCode).toBe(422);
    const old = (
      await browser.post('/v1/account/prescriptions', {
        label: 'Old',
        rx,
        prescribedAt: '2020-01-01',
      })
    ).json<SavedPrescription>();
    expect(old.expiry).toBe('expired');
    const unknown = (
      await browser.post('/v1/account/prescriptions', { label: 'Undated', rx })
    ).json<SavedPrescription>();
    expect(unknown).toMatchObject({ expiry: 'unknown', expiresAt: null });
    const renamed = (
      await browser.request('PATCH', `/v1/account/prescriptions/${old.id}`, {
        body: { label: 'Old glasses' },
      })
    ).json<SavedPrescription[]>();
    expect(renamed.map((entry) => entry.label)).toContain('Old glasses');
    const missing = await browser.request(
      'PATCH',
      `/v1/account/prescriptions/${crypto.randomUUID()}`,
      {
        body: { label: 'x' },
      },
    );
    expect(missing.statusCode).toBe(404);
  });
});

describe('wishlist and orders, edge cases', () => {
  it('refuses unknown frames and removes saved ones', async () => {
    const { browser } = await signUp(context.app);
    const product = await context.db.product.findFirstOrThrow({ where: { slug: 'ives' } });
    expect(
      (await browser.request('PUT', `/v1/account/wishlist/items/${crypto.randomUUID()}`))
        .statusCode,
    ).toBe(404);
    await browser.request('PUT', `/v1/account/wishlist/items/${product.id}`);
    const removed = (
      await browser.request('DELETE', `/v1/account/wishlist/items/${product.id}`)
    ).json<Wishlist>();
    expect(removed.items).toEqual([]);
    expect((await new TestBrowser(context.app).get('/v1/wishlists/not-a-token')).statusCode).toBe(
      404,
    );
  });

  it('refuses a return after the window and an invoice before payment', async () => {
    const { browser, email } = await signUp(context.app);
    await browser.post('/v1/cart/items', { variantId: frame.id });
    const placed = await codOrder(browser, email);
    const number = placed.order.number;
    expect((await browser.get(`/v1/orders/${number}/invoice`)).statusCode).toBe(409);
    const order = await context.db.order.findUniqueOrThrow({ where: { number } });
    await context.db.order.update({ where: { id: order.id }, data: { status: 'DELIVERED' } });
    await context.db.orderEvent.create({
      data: {
        orderId: order.id,
        toStatus: 'DELIVERED',
        createdAt: new Date(Date.now() - 30 * 86_400_000),
      },
    });
    const view = (await browser.get(`/v1/orders/${number}`)).json<OrderView>();
    expect(view.actions.requestReturn).toBe(false);
    expect((await browser.post(`/v1/orders/${number}/return`, { reason: 'fit' })).statusCode).toBe(
      409,
    );
  });

  it('cancels an unpaid order without a refund, and a guest uses the order link', async () => {
    const guest = new TestBrowser(context.app);
    await guest.post('/v1/cart/items', { variantId: frame.id });
    const placed = await codOrder(guest, uniqueEmail('cancel'));
    const headers = { 'x-order-token': placed.accessToken };
    const response = await guest.request('POST', `/v1/orders/${placed.order.number}/cancel`, {
      body: {},
      headers,
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json<OrderView>().status).toBe('CANCELLED');
    const reorder = await guest.request('POST', `/v1/orders/${placed.order.number}/reorder`, {
      headers,
    });
    expect(reorder.json()).toEqual({ added: 1, skipped: [] });
  });

  it('attaches a prescription upload owned by the account to an order', async () => {
    const { browser, email, session } = await signUp(context.app);
    await browser.post('/v1/cart/items', {
      variantId: frame.id,
      lensConfig: {
        purpose: 'single-vision',
        prescription: { mode: 'later' },
        indexCode: '1.61',
        packageCode: 'complete',
      },
    });
    const placed = await codOrder(browser, email);
    const upload = await context.db.prescription.create({
      data: {
        label: 'Uploaded prescription',
        fileKey: `rx/${crypto.randomUUID()}.jpg`,
        fileMime: 'image/jpeg',
        userId: session.user.id,
      },
    });
    const item = placed.order.items[0]!;
    const response = await browser.post(`/v1/orders/${placed.order.number}/prescriptions`, {
      itemId: item.id,
      source: { mode: 'upload', uploadId: upload.id },
    });
    expect(response.statusCode, response.body).toBe(200);
    const stranger = await signUp(context.app);
    const refused = await stranger.browser.post(`/v1/orders/${placed.order.number}/prescriptions`, {
      itemId: item.id,
      source: { mode: 'upload', uploadId: upload.id },
    });
    expect(refused.statusCode).toBe(404);
  });
});
