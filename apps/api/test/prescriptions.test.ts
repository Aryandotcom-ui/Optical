import type { OrderView, PlacedOrder, UploadedPrescription } from '@optical/shared/checkout';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MemoryRateLimiter } from '../src/lib/rate-limit';
import { deliveryAddress, stockedVariant, TestBrowser } from './browser';
import { GPS_TEXT, jpegWithExif, multipart } from './fixtures';
import { buildDbTestApp } from './helpers';

let context: Awaited<ReturnType<typeof buildDbTestApp>>;
let frame: Awaited<ReturnType<typeof stockedVariant>>;

beforeAll(async () => {
  context = await buildDbTestApp();
  frame = await stockedVariant(context.db, 'yara');
});
afterAll(async () => {
  await context.app.close();
});

function upload(browser: TestBrowser, file: Buffer, filename?: string, type?: string) {
  const form = multipart(file, filename, type);
  return browser.request('POST', '/v1/prescriptions/uploads', {
    body: form.body,
    headers: { 'content-type': form.contentType },
  });
}

const laterLenses = {
  purpose: 'single-vision',
  prescription: { mode: 'later' },
  indexCode: '1.56',
};

describe('prescription uploads', () => {
  it('stores a cleaned copy privately and links to it for five minutes', async () => {
    const browser = new TestBrowser(context.app);
    const response = await upload(browser, jpegWithExif());
    expect(response.statusCode).toBe(201);
    const uploaded = response.json<UploadedPrescription>();
    expect(uploaded.mime).toBe('image/jpeg');
    expect(browser.cookie).not.toBeNull();

    const url = new URL(uploaded.previewUrl);
    const file = await context.app.inject({ method: 'GET', url: `${url.pathname}${url.search}` });
    expect(file.statusCode).toBe(200);
    expect(file.headers['content-type']).toBe('image/jpeg');
    expect(file.headers['cache-control']).toBe('private, no-store');
    expect(file.rawPayload.toString('latin1')).not.toContain(GPS_TEXT);

    url.searchParams.set('expires', String(Number(url.searchParams.get('expires')) + 3600));
    const altered = await context.app.inject({
      method: 'GET',
      url: `${url.pathname}${url.search}`,
    });
    expect(altered.statusCode).toBe(403);
  });

  it('refuses files that are not images or PDFs, whatever they are called', async () => {
    const browser = new TestBrowser(context.app);
    const response = await upload(
      browser,
      Buffer.from('<html><script>alert(1)</script>'),
      'rx.jpg',
    );
    expect(response.statusCode).toBe(415);
    expect(response.json()).toMatchObject({ error: { code: 'UNSUPPORTED_MEDIA_TYPE' } });
  });

  it('refuses files over 8 MB', async () => {
    const browser = new TestBrowser(context.app);
    const big = Buffer.concat([jpegWithExif(), Buffer.alloc(8 * 1024 * 1024)]);
    const response = await upload(browser, big);
    expect(response.statusCode).toBe(413);
  });

  it('can be used in a lens configuration only by the browser that uploaded it', async () => {
    const owner = new TestBrowser(context.app);
    const { id } = (await upload(owner, jpegWithExif())).json<UploadedPrescription>();
    const lensConfig = { ...laterLenses, prescription: { mode: 'upload', uploadId: id } };
    expect(
      (await owner.post('/v1/cart/items', { variantId: frame.id, lensConfig })).statusCode,
    ).toBe(200);
    const stranger = new TestBrowser(context.app);
    expect(
      (await stranger.post('/v1/cart/items', { variantId: frame.id, lensConfig })).statusCode,
    ).toBe(422);
  });

  it('is rate limited', async () => {
    const limited = await buildDbTestApp({ rateLimiter: new MemoryRateLimiter() });
    const browser = new TestBrowser(limited.app);
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 11; attempt += 1)
      statuses.push((await upload(browser, Buffer.from('not an image'))).statusCode);
    expect(statuses.slice(0, 10).every((status) => status === 415)).toBe(true);
    expect(statuses[10]).toBe(429);
    await limited.app.close();
  });
});

describe('sending a prescription after ordering', () => {
  it('holds the order for review and accepts typed values from the order page', async () => {
    const browser = new TestBrowser(context.app);
    await browser.post('/v1/cart/items', { variantId: frame.id, lensConfig: laterLenses });
    const quote = (
      await browser.post('/v1/checkout/quote', {
        postalCode: deliveryAddress.postalCode,
        paymentProvider: 'cod',
      })
    ).json<{ pricing: { totalMinor: number } }>();
    const placed = (
      await browser.post(
        '/v1/checkout/orders',
        {
          contact: { email: 'later@example.com', phone: '9876543210' },
          address: deliveryAddress,
          shippingSpeed: 'standard',
          paymentProvider: 'cod',
          expectedTotalMinor: quote.pricing.totalMinor,
        },
        { 'idempotency-key': crypto.randomUUID() },
      )
    ).json<PlacedOrder>();
    expect(placed.order).toMatchObject({
      status: 'PRESCRIPTION_REVIEW',
      awaitingPrescription: true,
      items: [{ prescription: { mode: 'later', provided: false } }],
    });
    expect(placed.order.upcoming.map((step) => step.status)).toEqual([
      'IN_PRODUCTION',
      'QUALITY_CHECK',
      'SHIPPED',
      'DELIVERED',
    ]);

    const itemId = placed.order.items[0]?.id ?? '';
    const headers = { 'x-order-token': placed.accessToken };
    const invalid = await browser.post(
      `/v1/orders/${placed.order.number}/prescriptions`,
      {
        itemId,
        source: {
          mode: 'manual',
          rx: {
            right: { sph: -13, cyl: null, axis: null, add: null },
            left: { sph: -1, cyl: null, axis: null, add: null },
            pd: { kind: 'single', value: 62 },
          },
        },
      },
      headers,
    );
    expect(invalid.statusCode).toBe(422);
    expect(invalid.json()).toMatchObject({ error: { details: [{ path: 'source.rx.right.sph' }] } });

    const attached = await browser.post(
      `/v1/orders/${placed.order.number}/prescriptions`,
      {
        itemId,
        source: {
          mode: 'manual',
          rx: {
            right: { sph: -1.5, cyl: null, axis: null, add: null },
            left: { sph: -1.25, cyl: null, axis: null, add: null },
            pd: { kind: 'single', value: 62 },
          },
        },
      },
      headers,
    );
    expect(attached.statusCode).toBe(200);
    expect(attached.json<OrderView>().items[0]?.prescription).toEqual({
      mode: 'later',
      provided: true,
    });
  });
});
