import { describe, expect, it } from 'vitest';
import { commerce, indiaMarket, isValidPostalCode, type CommerceConfig } from './commerce';

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
