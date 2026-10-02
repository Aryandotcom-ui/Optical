import { describe, expect, expectTypeOf, it } from 'vitest';
import { defaultLensCatalog } from '../lens/default-catalog';
import { priceOrder, type PricingResult } from '../pricing/engine';
import {
  addCartItemSchema,
  addressSchema,
  applyCouponSchema,
  checkoutQuoteRequestSchema,
  emailSchema,
  orderNumberSchema,
  placeOrderSchema,
  pricingSchema,
  type Pricing,
} from './index';

const address = {
  fullName: 'Asha Kulkarni',
  line1: '14, 2nd Cross, Indiranagar',
  city: 'Bengaluru',
  region: 'Karnataka',
  postalCode: '560038',
};

describe('addressSchema', () => {
  it('accepts a complete address and fills the country', () => {
    expect(addressSchema.parse(address)).toEqual({
      ...address,
      line2: null,
      landmark: null,
      country: 'IN',
    });
  });

  it('trims fields and turns blank optional lines into null', () => {
    const parsed = addressSchema.parse({ ...address, fullName: '  Asha  ', line2: '   ' });
    expect(parsed.fullName).toBe('Asha');
    expect(parsed.line2).toBeNull();
  });

  it('explains each problem in plain language', () => {
    const result = addressSchema.safeParse({
      ...address,
      postalCode: '012345',
      region: 'Atlantis',
      city: '',
    });
    expect(result.success).toBe(false);
    const messages = Object.fromEntries(
      (result.error?.issues ?? []).map((issue) => [issue.path.join('.'), issue.message]),
    );
    expect(messages).toEqual({
      city: 'City is required.',
      region: 'Choose your state.',
      postalCode: 'Enter a valid PIN code, like 560001.',
    });
  });

  it('rejects another country', () => {
    expect(addressSchema.safeParse({ ...address, country: 'US' }).success).toBe(false);
  });
});

describe('contact fields', () => {
  it('lower-cases emails and rejects malformed ones', () => {
    expect(emailSchema.parse('  Asha@Example.COM ')).toBe('asha@example.com');
    expect(emailSchema.safeParse('asha@').success).toBe(false);
  });

  it('normalises the phone on a placed order', () => {
    const order = placeOrderSchema.parse({
      contact: { email: 'asha@example.com', phone: '98000 00003' },
      address,
      shippingSpeed: 'standard',
      paymentProvider: 'mock',
      expectedTotalMinor: 100,
    });
    expect(order.contact.phone).toBe('+919800000003');
  });

  it('rejects a phone that is not a mobile number', () => {
    const result = placeOrderSchema.safeParse({
      contact: { email: 'asha@example.com', phone: '12345' },
      address,
      shippingSpeed: 'standard',
      paymentProvider: 'mock',
      expectedTotalMinor: 100,
    });
    expect(result.error?.issues[0]?.message).toBe(
      'Enter a 10-digit mobile number, like 98765 43210.',
    );
  });
});

describe('cart requests', () => {
  it('defaults to one frame without lenses', () => {
    expect(addCartItemSchema.parse({ variantId: '0192f1e0-0000-7000-8000-000000000001' })).toEqual({
      variantId: '0192f1e0-0000-7000-8000-000000000001',
      quantity: 1,
      lensConfig: null,
    });
  });

  it('caps the quantity', () => {
    expect(
      addCartItemSchema.safeParse({
        variantId: '0192f1e0-0000-7000-8000-000000000001',
        quantity: 11,
      }).success,
    ).toBe(false);
  });

  it('upper-cases coupon codes and rejects odd characters', () => {
    expect(applyCouponSchema.parse({ code: ' welcome10 ' }).code).toBe('WELCOME10');
    expect(applyCouponSchema.safeParse({ code: 'WELCOME 10' }).success).toBe(false);
  });

  it('quotes standard delivery by default', () => {
    expect(checkoutQuoteRequestSchema.parse({}).shippingSpeed).toBe('standard');
  });

  it('accepts order numbers in any case', () => {
    expect(orderNumberSchema.parse('lo-26-001234')).toBe('LO-26-001234');
    expect(orderNumberSchema.safeParse('LO-001234').success).toBe(false);
  });
});

describe('pricingSchema', () => {
  it('accepts every pricing engine result unchanged', () => {
    expectTypeOf<PricingResult>().toExtend<Pricing>();
    const purpose = defaultLensCatalog.purposes[0];
    const result = priceOrder({
      items: [
        {
          key: 'a',
          name: 'Harbour',
          kind: 'frame',
          unitPriceMinor: 2_490_00,
          quantity: 1,
          lensLines: purpose
            ? [{ kind: 'base', code: purpose.code, label: purpose.name, priceMinor: 0 }]
            : [],
        },
      ],
      now: new Date('2026-09-15T00:00:00Z'),
      isFirstOrder: true,
      shipping: { speed: 'express', postalCode: '560038' },
      paymentMethod: 'prepaid',
    });
    expect(pricingSchema.parse(result)).toEqual(result);
  });
});
