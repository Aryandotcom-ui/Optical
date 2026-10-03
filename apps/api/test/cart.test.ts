import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Cart } from '@optical/shared/checkout';
import { buildDbTestApp } from './helpers';
import { stockedVariant, TestBrowser } from './browser';

let context: Awaited<ReturnType<typeof buildDbTestApp>>;
let frame: Awaited<ReturnType<typeof stockedVariant>>;
let accessory: Awaited<ReturnType<typeof stockedVariant>>;

beforeAll(async () => {
  context = await buildDbTestApp();
  frame = await stockedVariant(context.db, 'orla');
  accessory = await stockedVariant(context.db, 'glasses-cord');
});
afterAll(async () => {
  await context.app.close();
});

const singleVision = {
  purpose: 'single-vision',
  prescription: {
    mode: 'manual',
    rx: {
      right: { sph: -2.25, cyl: -0.5, axis: 90, add: null },
      left: { sph: -2, cyl: null, axis: null, add: null },
      pd: { kind: 'single', value: 63 },
    },
  },
  indexCode: '1.61',
  packageCode: 'complete',
};

describe('bag', () => {
  it('is empty, and starts no session, until something is added', async () => {
    const browser = new TestBrowser(context.app);
    const response = await browser.get('/v1/cart');
    expect(response.statusCode).toBe(200);
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json<Cart>()).toMatchObject({ items: [], itemCount: 0, couponCode: null });
  });

  it('adds a frame without lenses and starts an httpOnly session', async () => {
    const browser = new TestBrowser(context.app);
    const response = await browser.post('/v1/cart/items', { variantId: frame.id });
    expect(response.statusCode).toBe(200);
    const cookie = response.cookies.find((entry) => entry.name === 'lo_session');
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });
    const cart = response.json<Cart>();
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0]).toMatchObject({
      unitPriceMinor: frame.priceMinor,
      lensConfig: null,
      issue: null,
    });
    expect(cart.pricing.totalMinor).toBe(frame.priceMinor);
    // The session is remembered.
    expect((await browser.get('/v1/cart')).json<Cart>().itemCount).toBe(1);
  });

  it('re-prices lenses on the server and stores a snapshot', async () => {
    const browser = new TestBrowser(context.app);
    const quote = await browser.post('/v1/lens/quote', {
      productId: frame.productId,
      config: singleVision,
    });
    const lensTotal = quote.json<{ totalMinor: number }>().totalMinor;
    const response = await browser.post('/v1/cart/items', {
      variantId: frame.id,
      lensConfig: singleVision,
      expectedUnitPriceMinor: frame.priceMinor + lensTotal,
    });
    expect(response.statusCode).toBe(200);
    const [item] = response.json<Cart>().items;
    expect(item?.unitPriceMinor).toBe(frame.priceMinor + lensTotal);
    expect(item?.lensLines.map((line) => line.code)).toEqual(['single-vision', '1.61', 'complete']);
    expect(item?.lensConfig?.prescription).toMatchObject({ mode: 'manual' });
  });

  it('refuses a price the customer did not see', async () => {
    const browser = new TestBrowser(context.app);
    const response = await browser.post('/v1/cart/items', {
      variantId: frame.id,
      expectedUnitPriceMinor: frame.priceMinor - 100,
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: {
        code: 'PRICE_CHANGED',
        details: [{ path: 'expectedUnitPriceMinor', message: String(frame.priceMinor) }],
      },
    });
    expect((await browser.get('/v1/cart')).json<Cart>().itemCount).toBe(0);
  });

  it('explains invalid lens choices field by field', async () => {
    const browser = new TestBrowser(context.app);
    const response = await browser.post('/v1/cart/items', {
      variantId: frame.id,
      lensConfig: {
        ...singleVision,
        prescription: {
          mode: 'manual',
          rx: {
            ...singleVision.prescription.rx,
            right: { sph: -2, cyl: -0.5, axis: null, add: null },
          },
        },
      },
    });
    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({
      error: {
        code: 'VALIDATION_FAILED',
        details: [
          {
            path: 'lensConfig.prescription.rx.right.axis',
            message: expect.stringContaining('needs an axis'),
          },
        ],
      },
    });
  });

  it('does not sell lenses for an accessory, or a prescription it was not given', async () => {
    const browser = new TestBrowser(context.app);
    const accessoryLenses = await browser.post('/v1/cart/items', {
      variantId: accessory.id,
      lensConfig: { purpose: 'zero-power' },
    });
    expect(accessoryLenses.statusCode).toBe(422);
    const someoneElsesUpload = await browser.post('/v1/cart/items', {
      variantId: frame.id,
      lensConfig: {
        ...singleVision,
        prescription: { mode: 'upload', uploadId: crypto.randomUUID() },
      },
    });
    expect(someoneElsesUpload.statusCode).toBe(422);
    expect(someoneElsesUpload.json()).toMatchObject({
      error: { message: expect.stringContaining('upload') },
    });
  });

  it('refuses more than is in stock', async () => {
    const soldOut = await context.db.productVariant.findFirstOrThrow({
      where: { stock: { onHand: 0 }, isActive: true, product: { isPublished: true } },
    });
    const browser = new TestBrowser(context.app);
    const response = await browser.post('/v1/cart/items', { variantId: soldOut.id });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: { code: 'OUT_OF_STOCK', message: expect.stringContaining('out of stock') },
    });
  });

  it('merges identical lines and changes and removes quantities', async () => {
    const browser = new TestBrowser(context.app);
    await browser.post('/v1/cart/items', { variantId: accessory.id });
    const twice = (
      await browser.post('/v1/cart/items', { variantId: accessory.id, quantity: 2 })
    ).json<Cart>();
    expect(twice.items).toHaveLength(1);
    expect(twice.itemCount).toBe(3);
    const itemId = twice.items[0]?.id ?? '';

    const changed = await browser.request('PATCH', `/v1/cart/items/${itemId}`, {
      body: { quantity: 1 },
    });
    expect(changed.json<Cart>().itemCount).toBe(1);
    const tooMany = await browser.request('PATCH', `/v1/cart/items/${itemId}`, {
      body: { quantity: 11 },
    });
    expect(tooMany.statusCode).toBe(422);

    const removed = await browser.request('DELETE', `/v1/cart/items/${itemId}`);
    expect(removed.json<Cart>().items).toEqual([]);
  });

  it('applies coupons that work now and explains those that do not', async () => {
    const browser = new TestBrowser(context.app);
    expect(
      (await browser.request('PUT', '/v1/cart/coupon', { body: { code: 'FREESHIP' } })).statusCode,
    ).toBe(422);

    await browser.post('/v1/cart/items', { variantId: accessory.id });
    const unknown = await browser.request('PUT', '/v1/cart/coupon', { body: { code: 'NOPE10' } });
    expect(unknown.json()).toMatchObject({
      error: { message: "We don't recognise the code NOPE10. Check the spelling." },
    });
    const belowMinimum = await browser.request('PUT', '/v1/cart/coupon', {
      body: { code: 'flat300' },
    });
    expect(belowMinimum.statusCode).toBe(422);
    expect(belowMinimum.json()).toMatchObject({
      error: { message: expect.stringContaining('₹2,999') },
    });

    const applied = await browser.request('PUT', '/v1/cart/coupon', { body: { code: 'freeship' } });
    expect(applied.json<Cart>()).toMatchObject({
      couponCode: 'FREESHIP',
      pricing: { coupon: { applied: true, freeShipping: true }, shipping: { feeMinor: 0 } },
    });
    const cleared = await browser.request('DELETE', '/v1/cart/coupon');
    expect(cleared.json<Cart>().couponCode).toBeNull();
  });
});

describe('cross-site protection', () => {
  it('blocks a cookie-carrying write from another origin', async () => {
    const browser = new TestBrowser(context.app);
    await browser.post('/v1/cart/items', { variantId: accessory.id });
    const forged = await browser.request('POST', '/v1/cart/items', {
      body: { variantId: accessory.id },
      origin: 'https://evil.example',
    });
    expect(forged.statusCode).toBe(403);
    const noOrigin = await browser.request('POST', '/v1/cart/items', {
      body: { variantId: accessory.id },
      origin: null,
    });
    expect(noOrigin.statusCode).toBe(403);
    expect((await browser.get('/v1/cart')).json<Cart>().itemCount).toBe(1);
  });

  it('only accepts JSON bodies, so a plain HTML form cannot post', async () => {
    const response = await context.app.inject({
      method: 'POST',
      url: '/v1/cart/items',
      headers: { 'content-type': 'text/plain', origin: 'http://localhost:3000' },
      payload: '{"variantId":"x"}',
    });
    expect(response.statusCode).toBe(415);
  });
});
