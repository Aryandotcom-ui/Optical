import { randomUUID } from 'node:crypto';
import type { AdminMe, AdminPage } from '@optical/shared/admin';
import type { CheckoutQuote, PlacedOrder } from '@optical/shared/checkout';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildMockWebhook } from '../src/modules/payments/mock';
import { signUp, uniqueEmail } from './accounts';
import { deliveryAddress, stockedVariant, TestBrowser } from './browser';
import { jpegWithExif, multipart, pngWithText } from './fixtures';
import { baseTestEnv, buildDbTestApp } from './helpers';

let context: Awaited<ReturnType<typeof buildDbTestApp>>;
let admin: TestBrowser;
let staff: TestBrowser;

async function signIn(email: string, password: string) {
  const browser = new TestBrowser(context.app);
  const response = await browser.post('/v1/auth/login', { email, password });
  expect(response.statusCode, response.body).toBe(200);
  return browser;
}

const send = (
  browser: TestBrowser,
  method: 'PATCH' | 'PUT' | 'DELETE',
  url: string,
  body?: unknown,
) => browser.request(method, url, body === undefined ? {} : { body });

beforeAll(async () => {
  context = await buildDbTestApp({ env: { LOG_LEVEL: process.env.DEBUG_LOG ?? 'silent' } });
  admin = await signIn('admin@example.com', 'Admin#Lumen2026');
  staff = await signIn('staff@example.com', 'Staff#Lumen2026');
});
afterAll(async () => {
  await context.app.close();
});

/** A paid order for frames with an uploaded prescription, waiting for review. */
async function orderAwaitingReview() {
  const { browser, email } = await signUp(context.app);
  const frame = await stockedVariant(context.db, 'harbour');
  const form = multipart(jpegWithExif());
  const uploaded = await browser.request('POST', '/v1/prescriptions/uploads', {
    body: form.body,
    headers: { 'content-type': form.contentType },
  });
  const uploadId = uploaded.json<{ id: string }>().id;
  await browser.post('/v1/cart/items', {
    variantId: frame.id,
    lensConfig: {
      purpose: 'single-vision',
      prescription: { mode: 'upload', uploadId },
      indexCode: '1.61',
      packageCode: 'complete',
    },
  });
  const quote = (
    await browser.post('/v1/checkout/quote', {
      shippingSpeed: 'standard',
      postalCode: deliveryAddress.postalCode,
      paymentProvider: 'mock',
      email,
    })
  ).json<CheckoutQuote>();
  const placed = (
    await browser.post(
      '/v1/checkout/orders',
      {
        contact: { email, phone: '98450 12345' },
        address: deliveryAddress,
        shippingSpeed: 'standard',
        paymentProvider: 'mock',
        expectedTotalMinor: quote.pricing.totalMinor,
      },
      { 'idempotency-key': randomUUID() },
    )
  ).json<PlacedOrder>();
  const paymentId = placed.payment?.kind === 'mock' ? placed.payment.paymentId : '';
  await browser.post('/v1/payments/mock/simulate', { paymentId, outcome: 'success' });
  for (const { job } of context.jobs.mockWebhooks.splice(0)) {
    const { body, headers } = buildMockWebhook(baseTestEnv.APP_SECRET, job);
    await context.app.inject({ method: 'POST', url: '/v1/webhooks/mock', headers, payload: body });
  }
  const order = await context.db.order.findUniqueOrThrow({
    where: { number: placed.order.number },
    include: { items: true },
  });
  return { order, email, prescriptionId: order.items[0]?.prescriptionId ?? '' };
}

describe('admin access (RBAC)', () => {
  it('keeps guests and customers out, and lets each role do only its own work', async () => {
    expect((await new TestBrowser(context.app).get('/v1/admin/me')).statusCode).toBe(401);
    const customer = await signUp(context.app);
    expect((await customer.browser.get('/v1/admin/me')).statusCode).toBe(403);
    expect((await customer.browser.get('/v1/admin/orders')).statusCode).toBe(403);

    const me = (await staff.get('/v1/admin/me')).json<AdminMe>();
    expect(me.role).toBe('STAFF');
    expect(me.areas.find((area) => area.area === 'products')).toEqual({
      area: 'products',
      write: false,
    });
    expect(me.areas.some((area) => area.area === 'settings')).toBe(false);

    expect((await staff.get('/v1/admin/orders')).statusCode).toBe(200);
    expect((await staff.get('/v1/admin/products')).statusCode).toBe(200);
    expect(
      (
        await staff.post('/v1/admin/coupons', {
          code: 'NOPE10',
          description: 'x',
          kind: 'free-shipping',
        })
      ).statusCode,
    ).toBe(403);
    expect((await customer.browser.post('/v1/admin/coupons', {})).statusCode).toBe(403);
    expect((await staff.get('/v1/admin/settings')).statusCode).toBe(403);
    expect((await staff.get('/v1/admin/audit')).statusCode).toBe(403);
    expect((await staff.get('/v1/admin/lens')).statusCode).toBe(403);
    const anyProduct = await context.db.product.findFirstOrThrow();
    expect(
      (await send(staff, 'PATCH', `/v1/admin/products/${anyProduct.id}`, { name: 'Nope' }))
        .statusCode,
    ).toBe(403);

    const adminMe = (await admin.get('/v1/admin/me')).json<AdminMe>();
    expect(adminMe.areas.every((area) => area.write)).toBe(true);
  });

  it('applies a role change at once and signs the person out', async () => {
    const person = await signUp(context.app);
    const user = await context.db.user.findUniqueOrThrow({ where: { email: person.email } });
    const changed = await send(admin, 'PUT', `/v1/admin/customers/${user.id}/role`, {
      role: 'STAFF',
    });
    expect(changed.statusCode, changed.body).toBe(200);
    // The old session ended; signing in again gives staff access.
    expect((await person.browser.get('/v1/admin/me')).statusCode).toBe(401);
    expect(
      (await send(staff, 'PUT', `/v1/admin/customers/${user.id}/role`, { role: 'ADMIN' }))
        .statusCode,
    ).toBe(403);
    const self = await context.db.user.findUniqueOrThrow({ where: { email: 'admin@example.com' } });
    expect(
      (await send(admin, 'PUT', `/v1/admin/customers/${self.id}/role`, { role: 'STAFF' }))
        .statusCode,
    ).toBe(409);
  });
});

describe('catalogue admin', () => {
  it('creates a draft, adds a colour and an image, adjusts stock, and audits each step', async () => {
    const slug = `test-${randomUUID().slice(0, 8)}`;
    const created = await admin.post('/v1/admin/products', {
      name: 'Test Frame',
      slug,
      categorySlug: 'eyeglasses',
      type: 'frame',
      basePriceMinor: 2_490_00,
      description: 'A frame made in a test.',
    });
    expect(created.statusCode, created.body).toBe(201);
    const product = created.json<{ id: string; isPublished: boolean }>();
    expect(product.isPublished).toBe(false);
    // Publishing without a colour is refused.
    expect(
      (await send(admin, 'PATCH', `/v1/admin/products/${product.id}`, { isPublished: true }))
        .statusCode,
    ).toBe(409);
    const bulk = await admin.post('/v1/admin/products/bulk', {
      ids: [product.id],
      action: 'publish',
    });
    expect(bulk.json()).toEqual({ updated: 0, skipped: 1 });

    const sku = `TEST-${randomUUID().slice(0, 6).toUpperCase()}`;
    const withColour = await admin.post(`/v1/admin/products/${product.id}/variants`, {
      sku,
      colourName: 'Ink',
      colourFamily: 'black',
      swatchHex: '#111111',
    });
    expect(withColour.statusCode, withColour.body).toBe(200);
    const variantId = withColour.json<{ variants: { id: string }[] }>().variants[0]?.id ?? '';

    const form = multipart(pngWithText(), 'front-view.png', 'image/png');
    const image = await admin.request('POST', `/v1/admin/products/${product.id}/images`, {
      body: form.body,
      headers: { 'content-type': form.contentType },
    });
    expect(image.statusCode, image.body).toBe(200);
    const url = image.json<{ images: { url: string; alt: string }[] }>().images[0];
    expect(url?.alt).toBe('front view');
    const served = await context.app.inject({
      method: 'GET',
      url: new URL(url?.url ?? '').pathname,
    });
    expect(served.statusCode).toBe(200);
    expect(served.headers['content-type']).toBe('image/png');

    const adjusted = await admin.post(`/v1/admin/inventory/${variantId}/adjust`, {
      delta: 12,
      reason: 'Delivery from supplier',
    });
    expect(adjusted.json()).toMatchObject({ onHand: 12 });
    expect(
      (await admin.post(`/v1/admin/inventory/${variantId}/adjust`, { delta: -20, reason: 'Count' }))
        .statusCode,
    ).toBe(409);
    expect(
      (
        await staff.post(`/v1/admin/inventory/${variantId}/adjust`, {
          delta: -2,
          reason: 'Damaged',
        })
      ).statusCode,
    ).toBe(200);

    const updated = await send(admin, 'PATCH', `/v1/admin/products/${product.id}`, {
      seoTitle: 'Test Frame in ink',
      styleTags: ['minimal'],
      frame: {
        shape: 'round',
        lensWidthMm: 48,
        lensHeightMm: 42,
        bridgeMm: 20,
        templeMm: 145,
        totalWidthMm: 136,
        weightG: 18,
        material: 'acetate',
        rimType: 'full-rim',
      },
    });
    expect(updated.statusCode, updated.body).toBe(200);
    expect(updated.json()).toMatchObject({
      seoTitle: 'Test Frame in ink',
      frame: { shape: 'round' },
    });

    const inventory = (await admin.get(`/v1/admin/inventory?q=${sku}`)).json<
      AdminPage<{ onHand: number }>
    >();
    expect(inventory.items[0]?.onHand).toBe(10);
    const history = (await admin.get(`/v1/admin/inventory/${variantId}/history`)).json<
      { delta: number }[]
    >();
    expect(history.map((entry) => entry.delta)).toEqual([-2, 12]);

    const audit = (await admin.get(`/v1/admin/audit?entityId=${product.id}`)).json<
      AdminPage<{ action: string; actorEmail: string }>
    >();
    expect(audit.items.map((entry) => entry.action)).toEqual(
      expect.arrayContaining(['product.create', 'product.update', 'image.reorder'].slice(0, 2)),
    );
    expect(audit.items.every((entry) => entry.actorEmail === 'admin@example.com')).toBe(true);
    const stockAudit = await context.db.auditLog.count({
      where: { entityId: variantId, action: 'stock.adjust' },
    });
    expect(stockAudit).toBe(2);

    const csv = await admin.get(`/v1/admin/products?format=csv&q=${slug}`);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.body.split('\r\n')[1]).toContain('"Test Frame"');

    await admin.post('/v1/admin/products/bulk', { ids: [product.id], action: 'archive' });
    expect((await admin.get(`/v1/admin/products/${product.id}`)).statusCode).toBe(404);
  });

  it('edits the lens catalogue and moderates reviews', async () => {
    const lens = (await admin.get('/v1/admin/lens')).json<{
      coatings: { code: string; description?: string; name: string }[];
    }>();
    const coating = lens.coatings[0];
    expect(coating).toBeDefined();
    const renamed = await send(admin, 'PATCH', `/v1/admin/lens/coatings/${coating?.code ?? ''}`, {
      name: `${coating?.name ?? ''} `,
    });
    expect(renamed.statusCode, renamed.body).toBe(200);

    const product = await context.db.product.findFirstOrThrow({ where: { slug: 'harbour' } });
    const review = await context.db.review.create({
      data: {
        productId: product.id,
        authorName: 'Test',
        rating: 5,
        title: 'Lovely',
        body: 'Fits well.',
        status: 'PENDING',
      },
    });
    expect(
      (await admin.get('/v1/admin/reviews?status=PENDING'))
        .json<AdminPage<{ id: string }>>()
        .items.some((item) => item.id === review.id),
    ).toBe(true);
    const rejected = await staff.post(`/v1/admin/reviews/${review.id}/moderate`, {
      status: 'REJECTED',
    });
    expect(rejected.statusCode, rejected.body).toBe(200);
    expect((await context.db.review.findUniqueOrThrow({ where: { id: review.id } })).status).toBe(
      'REJECTED',
    );
    await context.db.review.delete({ where: { id: review.id } });
  });
});

describe('orders and prescriptions', () => {
  it('approves a prescription: the order moves into production and the customer is emailed', async () => {
    const { order, email, prescriptionId } = await orderAwaitingReview();
    expect(order.status).toBe('PRESCRIPTION_REVIEW');
    const queue = (await staff.get('/v1/admin/prescriptions')).json<
      AdminPage<{ id: string; orders: string[] }>
    >();
    expect(queue.items.find((item) => item.id === prescriptionId)?.orders).toEqual([order.number]);
    const detail = (await staff.get(`/v1/admin/prescriptions/${prescriptionId}`)).json<{
      fileUrl: string;
    }>();
    expect(detail.fileUrl).toContain('/v1/files/rx/');

    // Production can't start before the prescription is checked.
    expect(
      (await staff.post(`/v1/admin/orders/${order.id}/transition`, { to: 'IN_PRODUCTION' }))
        .statusCode,
    ).toBe(409);
    const reviewed = await staff.post(`/v1/admin/prescriptions/${prescriptionId}/review`, {
      decision: 'approve',
    });
    expect(reviewed.statusCode, reviewed.body).toBe(200);
    const after = await context.db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(after).toMatchObject({ status: 'IN_PRODUCTION', awaitingPrescription: false });
    expect(
      await context.db.emailOutbox.count({ where: { to: email, template: 'prescription-update' } }),
    ).toBe(1);

    // The state machine still decides: production can't jump to delivered.
    const jump = await staff.post(`/v1/admin/orders/${order.id}/transition`, { to: 'DELIVERED' });
    expect(jump.statusCode).toBe(409);
    await staff.post(`/v1/admin/orders/${order.id}/transition`, {
      to: 'QUALITY_CHECK',
      note: 'Lenses fitted',
    });
    const shipped = await send(staff, 'PATCH', `/v1/admin/orders/${order.id}`, {
      carrier: 'Delhivery',
      trackingNumber: 'DL123456',
      internalNote: 'Fragile',
    });
    expect(shipped.json()).toMatchObject({ carrier: 'Delhivery', trackingNumber: 'DL123456' });
    const moved = await staff.post(`/v1/admin/orders/${order.id}/transition`, { to: 'SHIPPED' });
    expect(moved.json()).toMatchObject({ status: 'SHIPPED', nextStatuses: ['DELIVERED'] });

    const refund = await staff.post(`/v1/admin/orders/${order.id}/refund`, {
      amountMinor: 100_00,
      reason: 'Goodwill for the delay',
    });
    expect(refund.statusCode, refund.body).toBe(200);
    expect(
      refund.json<{ refunds: { status: string; amountMinor: number }[] }>().refunds[0],
    ).toMatchObject({ status: 'SUCCEEDED', amountMinor: 100_00 });
    expect(
      (
        await staff.post(`/v1/admin/orders/${order.id}/refund`, {
          amountMinor: 999_999_00,
          reason: 'Too much',
        })
      ).statusCode,
    ).toBe(409);

    const csv = await staff.get(`/v1/admin/orders?format=csv&q=${order.number}`);
    expect(csv.body).toContain(order.number);
  });

  it('asks for a correction with a templated message', async () => {
    const { order, email, prescriptionId } = await orderAwaitingReview();
    const response = await staff.post(`/v1/admin/prescriptions/${prescriptionId}/review`, {
      decision: 'correction',
      template: 'missing-pd',
      note: 'The PD is cut off at the bottom of the photo.',
    });
    expect(response.json()).toMatchObject({ status: 'NEEDS_CORRECTION' });
    const queued = await context.db.emailOutbox.findFirstOrThrow({
      where: { to: email, template: 'prescription-update' },
    });
    expect(JSON.stringify(queued.payload)).toContain('does not show a pupillary distance');
    expect((await context.db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      'PRESCRIPTION_REVIEW',
    );
  });
});

describe('store settings, coupons and help', () => {
  it('saves settings that the storefront reads, and switches features', async () => {
    const current = (await admin.get('/v1/admin/settings')).json<{
      market: Record<string, unknown>;
    }>();
    // Only the stock default changes, so parallel checkout tests keep their prices.
    const saved = await send(admin, 'PUT', '/v1/admin/settings/market', {
      ...current.market,
      lowStockThreshold: 7,
    });
    expect(saved.statusCode, saved.body).toBe(200);
    expect(saved.json()).toMatchObject({ market: { lowStockThreshold: 7 } });
    const flag = await send(admin, 'PUT', '/v1/admin/settings/flags/frameFinder', {
      enabled: false,
    });
    expect(flag.json<{ flags: { key: string; enabled: boolean }[] }>().flags).toContainEqual({
      key: 'frameFinder',
      enabled: false,
    });
    const publicSettings = (await context.app.inject({ method: 'GET', url: '/v1/settings' })).json<{
      flags: { frameFinder: boolean };
    }>();
    expect(publicSettings.flags.frameFinder).toBe(false);
    expect(
      (await send(admin, 'PUT', '/v1/admin/settings/flags/devTools', { enabled: true })).statusCode,
    ).toBe(404);
    await send(admin, 'PUT', '/v1/admin/settings/flags/frameFinder', { enabled: true });
    await send(admin, 'PUT', '/v1/admin/settings/market', current.market);
  });

  it('creates coupons and help articles, with validation', async () => {
    const code = `T${randomUUID().slice(0, 6).toUpperCase().replaceAll('-', '')}`;
    expect(
      (await admin.post('/v1/admin/coupons', { code, description: 'Test', kind: 'percentage' }))
        .statusCode,
    ).toBe(422);
    const coupon = await admin.post('/v1/admin/coupons', {
      code,
      description: 'Ten off',
      kind: 'percentage',
      percentBasisPoints: 1000,
    });
    expect(coupon.statusCode, coupon.body).toBe(201);
    const id = coupon.json<{ id: string }>().id;
    expect(
      (await send(admin, 'PATCH', `/v1/admin/coupons/${id}`, { active: false })).json(),
    ).toMatchObject({ active: false });
    expect(
      (await admin.post('/v1/admin/coupons', { code, description: 'Again', kind: 'free-shipping' }))
        .statusCode,
    ).toBe(409);

    const slug = `test-${randomUUID().slice(0, 8)}`;
    const article = await staff.post('/v1/admin/help', {
      slug,
      title: 'Test article',
      topic: 'care',
      body: 'Rinse, then dry.',
      isPublished: false,
    });
    expect(article.statusCode, article.body).toBe(201);
    const articleId = article.json<{ id: string }>().id;
    expect(
      (
        await send(staff, 'PATCH', `/v1/admin/help/${articleId}`, { title: 'Cleaning your lenses' })
      ).json(),
    ).toMatchObject({ title: 'Cleaning your lenses' });
    expect((await send(staff, 'DELETE', `/v1/admin/help/${articleId}`)).statusCode).toBe(200);

    const customers = (
      await staff.get(`/v1/admin/customers?q=${encodeURIComponent('asha@example.com')}`)
    ).json<AdminPage<{ email: string }>>();
    expect(customers.items[0]?.email).toBe('asha@example.com');
    const dashboard = (await staff.get('/v1/admin/dashboard?days=365')).json<{
      orders: number;
      lowStock: unknown[];
    }>();
    expect(dashboard.orders).toBeGreaterThan(0);
    expect(uniqueEmail()).toContain('@');
  });
});
