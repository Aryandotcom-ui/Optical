import { describe, expect, it } from 'vitest';
import {
  commerce,
  indiaMarket,
  isValidPostalCode,
  lookupPostalCode,
  normalisePhone,
  shippingZoneFor,
  type CommerceConfig,
} from './commerce';

describe('commerce config', () => {
  it('keeps money values as integer minor units', () => {
    const moneyValues = [
      commerce.shipping.freeShippingThresholdMinor,
      commerce.shipping.standardFeeMinor,
      commerce.shipping.expressFeeMinor,
      commerce.cashOnDelivery.feeMinor,
      commerce.cashOnDelivery.maxOrderTotalMinor,
    ];
    for (const value of moneyValues) expect(Number.isSafeInteger(value)).toBe(true);
  });

  it('uses a currency and locale that Intl understands', () => {
    expect(
      () =>
        new Intl.NumberFormat(commerce.locale, { style: 'currency', currency: commerce.currency }),
    ).not.toThrow();
  });
});

describe('isValidPostalCode', () => {
  it('accepts valid Indian PIN codes, trimming whitespace', () => {
    expect(isValidPostalCode('560001', indiaMarket)).toBe(true);
    expect(isValidPostalCode(' 110001 ', indiaMarket)).toBe(true);
  });

  it('rejects codes with the wrong shape', () => {
    for (const code of ['060001', '56001', '5600011', 'ABCDEF', '']) {
      expect(isValidPostalCode(code, indiaMarket)).toBe(false);
    }
  });

  it('follows whichever market it is given', () => {
    const us: CommerceConfig = {
      ...indiaMarket,
      country: 'US',
      postalCode: { label: 'ZIP code', pattern: '^\\d{5}(-\\d{4})?$', example: '94103' },
    };
    expect(isValidPostalCode('94103-1234', us)).toBe(true);
    expect(isValidPostalCode('560001', us)).toBe(false);
  });
});

describe('shippingZoneFor', () => {
  it('matches the longest postal prefix', () => {
    expect(shippingZoneFor('560001').code).toBe('metro');
    expect(shippingZoneFor('744101').code).toBe('remote');
    expect(shippingZoneFor('781001').code).toBe('remote');
    expect(shippingZoneFor('302001').code).toBe('rest-of-india');
  });

  it('falls back to the default zone for unknown or missing codes', () => {
    expect(shippingZoneFor(null).code).toBe('rest-of-india');
    expect(shippingZoneFor('').code).toBe('rest-of-india');
  });

  it('fails loudly when the default zone is misconfigured', () => {
    const broken: CommerceConfig = {
      ...indiaMarket,
      shipping: { ...indiaMarket.shipping, defaultZoneCode: 'nowhere' },
    };
    expect(() => shippingZoneFor('302001', broken)).toThrow(/nowhere/);
  });
});

describe('lookupPostalCode', () => {
  it('finds the region by postal circle and the city for major districts', () => {
    expect(lookupPostalCode('560038')).toEqual({ region: 'Karnataka', city: 'Bengaluru' });
    expect(lookupPostalCode('400050')).toEqual({ region: 'Maharashtra', city: 'Mumbai' });
    expect(lookupPostalCode('781005')).toEqual({ region: 'Assam', city: 'Guwahati' });
    expect(lookupPostalCode('577201')).toEqual({ region: 'Karnataka', city: null });
  });

  it('prefers the longest prefix', () => {
    expect(lookupPostalCode('403001')?.region).toBe('Goa');
    expect(lookupPostalCode('194101')?.region).toBe('Ladakh');
    expect(lookupPostalCode('248001')).toEqual({ region: 'Uttarakhand', city: 'Dehradun' });
    expect(lookupPostalCode('160017')).toEqual({ region: 'Chandigarh', city: 'Chandigarh' });
  });

  it('returns null for invalid or unknown codes', () => {
    expect(lookupPostalCode('012345')).toBeNull();
    expect(lookupPostalCode('5600')).toBeNull();
    expect(lookupPostalCode('990001')).toBeNull();
  });

  it('only ever names regions from the market list', () => {
    const regions = new Set(indiaMarket.address.regions);
    for (const entry of indiaMarket.address.postalLookup) expect(regions).toContain(entry.region);
  });
});

describe('normalisePhone', () => {
  it.each([
    ['98765 43210', '+919876543210'],
    ['+91 98765-43210', '+919876543210'],
    ['09876543210', '+919876543210'],
    ['0091 9876543210', '+919876543210'],
    ['(987) 654 3210', '+919876543210'],
  ])('normalises %s', (input, expected) => {
    expect(normalisePhone(input)).toBe(expected);
  });

  it.each(['12345', '5876543210', '98765432101', '98765x3210', ''])('rejects %s', (input) => {
    expect(normalisePhone(input)).toBeNull();
  });
});
