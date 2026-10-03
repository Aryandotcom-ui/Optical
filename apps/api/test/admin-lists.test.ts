import type { AdminPage } from '@optical/shared/admin';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TestBrowser } from './browser';
import { buildDbTestApp } from './helpers';

let context: Awaited<ReturnType<typeof buildDbTestApp>>;
let admin: TestBrowser;

beforeAll(async () => {
  context = await buildDbTestApp({ env: { LOG_LEVEL: process.env.DEBUG_LOG ?? 'silent' } });
  admin = new TestBrowser(context.app);
  const response = await admin.post('/v1/auth/login', {
    email: 'admin@example.com',
    password: 'Admin#Lumen2026',
  });
  expect(response.statusCode, response.body).toBe(200);
});
afterAll(async () => {
  await context.app.close();
});

const page = async <T>(url: string) => {
  const response = await admin.get(url);
  expect(response.statusCode, `${url}: ${response.body}`).toBe(200);
  return response.json<AdminPage<T>>();
};
const csv = async (url: string) => {
  const response = await admin.get(url);
  expect(response.statusCode, `${url}: ${response.body}`).toBe(200);
  expect(response.headers['content-type']).toContain('text/csv');
  return response.body.split('\r\n');
};
/** A refusal the person can act on: a 4xx with an error code, never a crash. */
const refused = (response: { statusCode: number; body: string }) => {
  expect(response.statusCode, response.body).toBeGreaterThanOrEqual(400);
  expect(response.statusCode, response.body).toBeLessThan(500);
};

describe('admin lists: search, filters, sorting, paging and CSV', () => {
  it('products', async () => {
    const all = await page<{ name: string }>('/v1/admin/products?pageSize=5&sort=name&dir=asc');
    expect(all.items).toHaveLength(5);
    expect(all.items.map((item) => item.name)).toEqual(
      [...all.items.map((item) => item.name)].sort((a, b) => a.localeCompare(b)),
    );
    const second = await page<{ name: string }>(
      '/v1/admin/products?pageSize=5&page=2&sort=name&dir=asc',
    );
    expect(second.items[0]?.name).not.toBe(all.items[0]?.name);
    const published = await page('/v1/admin/products?status=published&category=sunglasses');
    expect(published.total).toBeGreaterThan(0);
    const drafts = await page('/v1/admin/products?status=draft&q=zzzz-no-match');
    expect(drafts.total).toBe(0);
    expect((await csv('/v1/admin/products?format=csv&q=harbour'))[0]).toContain('"Name"');
  });

  it('orders and prescriptions', async () => {
    const sorted = await page<{ totalMinor: number }>('/v1/admin/orders?sort=totalMinor&dir=asc');
    const totals = sorted.items.map((item) => item.totalMinor);
    expect(totals).toEqual([...totals].sort((a, b) => a - b));
    const delivered = await page<{ status: string }>('/v1/admin/orders?status=DELIVERED');
    expect(delivered.items.every((item) => item.status === 'DELIVERED')).toBe(true);
    await page('/v1/admin/orders?awaiting=true&q=LO-');
    expect((await page('/v1/admin/orders?status=NOT_A_STATUS')).total).toBeGreaterThan(0);
    expect((await csv('/v1/admin/orders?format=csv&sort=number&dir=asc'))[0]).toContain('"Status"');
    await page('/v1/admin/prescriptions?status=VERIFIED');
    await page('/v1/admin/prescriptions');
  });

  it('customers, coupons, reviews, help and the audit log', async () => {
    const customers = await page<{ email: string }>(
      '/v1/admin/customers?sort=email&dir=asc&q=example.com',
    );
    expect(customers.total).toBeGreaterThan(0);
    expect((await csv('/v1/admin/customers?format=csv'))[0]).toContain('"Email"');
    const coupons = await page<{ code: string }>('/v1/admin/coupons?sort=code&dir=asc&q=free');
    expect(coupons.items.map((item) => item.code)).toContain('FREESHIP');
    await page('/v1/admin/coupons?sort=usageCount');
    await page('/v1/admin/reviews?status=PUBLISHED&pageSize=5');
    await page('/v1/admin/reviews');
    expect((await page('/v1/admin/help?q=prescription')).total).toBeGreaterThan(0);
    await page('/v1/admin/audit?entityType=Coupon&q=coupon');
    await page('/v1/admin/audit?entityId=nothing&dir=asc');
    expect((await csv('/v1/admin/audit?format=csv'))[0]).toContain('"Before"');
    const dashboard = await admin.get('/v1/admin/dashboard?days=7');
    expect(dashboard.statusCode).toBe(200);
  });

  it('inventory', async () => {
    const bySku = await page<{ sku: string; variantId: string }>(
      '/v1/admin/inventory?sort=sku&dir=asc&pageSize=10',
    );
    const skus = bySku.items.map((item) => item.sku);
    expect(skus).toEqual([...skus].sort((a, b) => a.localeCompare(b)));
    await page('/v1/admin/inventory?sort=available&dir=desc&low=true');
    await page('/v1/admin/inventory?q=HARBOUR');
    expect((await csv('/v1/admin/inventory?format=csv'))[0]).toContain('"SKU"');
    const variantId = bySku.items[0]?.variantId ?? '';
    const history = await admin.get(`/v1/admin/inventory/${variantId}/history`);
    expect(history.statusCode).toBe(200);
  });
});

describe('admin refusals', () => {
  it('explains what it will not do instead of failing', async () => {
    const missing = '00000000-0000-7000-8000-000000000000';
    refused(await admin.get(`/v1/admin/products/${missing}`));
    refused(await admin.get(`/v1/admin/orders/${missing}`));
    refused(await admin.get(`/v1/admin/prescriptions/${missing}`));
    refused(await admin.get(`/v1/admin/customers/${missing}`));
    refused(
      await admin.request('PATCH', `/v1/admin/variants/${missing}`, { body: { priceMinor: 100 } }),
    );
    refused(await admin.request('DELETE', `/v1/admin/images/${missing}`, {}));
    refused(
      await admin.post(`/v1/admin/inventory/${missing}/adjust`, { delta: 1, reason: 'Count' }),
    );
    refused(
      await admin.request('PATCH', `/v1/admin/inventory/${missing}`, {
        body: { lowStockThreshold: 3 },
      }),
    );
    refused(
      await admin.request('PATCH', '/v1/admin/lens/coatings/not-a-code', { body: { name: 'X' } }),
    );
    refused(
      await admin.request('PATCH', '/v1/admin/lens-rules/not-a-rule', {
        body: { isActive: false },
      }),
    );
    refused(
      await admin.request('PUT', '/v1/admin/settings/flags/notAFlag', { body: { enabled: true } }),
    );
    refused(await admin.request('DELETE', `/v1/admin/help/${missing}`, {}));
    refused(await admin.post(`/v1/admin/reviews/${missing}/moderate`, { status: 'PUBLISHED' }));

    // Stock can't go below what open orders have reserved.
    const stock = await context.db.stockItem.findFirstOrThrow({ where: { onHand: { gt: 0 } } });
    refused(
      await admin.post(`/v1/admin/inventory/${stock.variantId}/adjust`, {
        delta: -(stock.onHand + 1),
        reason: 'Too many',
      }),
    );
    // A coupon code and a help slug are unique.
    refused(
      await admin.post('/v1/admin/coupons', {
        code: 'FREESHIP',
        description: 'Duplicate',
        kind: 'free-shipping',
      }),
    );
    const article = await context.db.helpArticle.findFirstOrThrow();
    refused(
      await admin.post('/v1/admin/help', {
        slug: article.slug,
        title: 'Duplicate',
        topic: 'ordering',
        body: 'Duplicate slug.',
      }),
    );
    // Nobody changes their own role.
    const me = await context.db.user.findUniqueOrThrow({ where: { email: 'admin@example.com' } });
    refused(
      await admin.request('PUT', `/v1/admin/customers/${me.id}/role`, { body: { role: 'STAFF' } }),
    );
    // Orders move only along the state machine.
    const delivered = await context.db.order.findFirstOrThrow({ where: { status: 'DELIVERED' } });
    refused(
      await admin.post(`/v1/admin/orders/${delivered.id}/transition`, { to: 'PENDING_PAYMENT' }),
    );
    refused(
      await admin.post(`/v1/admin/orders/${delivered.id}/refund`, {
        amountMinor: delivered.totalMinor + 1,
        reason: 'More than paid',
      }),
    );
  });
});
