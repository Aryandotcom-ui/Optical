import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  applyBasisPoints,
  extractInclusiveTax,
  formatMoney,
  MoneyError,
  parseMajorUnits,
  roundHalfAwayFromZero,
  sumMinorUnits,
} from './money';

const usd = { currency: 'USD', locale: 'en-US', minorUnitsPerMajor: 100 };
const jpy = { currency: 'JPY', locale: 'ja-JP', minorUnitsPerMajor: 1 };
const amount = fc.integer({ min: -1_000_000_000, max: 1_000_000_000 });

describe('roundHalfAwayFromZero', () => {
  it('rounds halves away from zero symmetrically', () => {
    expect(roundHalfAwayFromZero(2.5)).toBe(3);
    expect(roundHalfAwayFromZero(-2.5)).toBe(-3);
    expect(roundHalfAwayFromZero(2.4999)).toBe(2);
    expect(roundHalfAwayFromZero(-0.4)).toBe(-0);
  });

  it('rejects non-finite input', () => {
    expect(() => roundHalfAwayFromZero(Number.NaN)).toThrow(MoneyError);
  });

  it('is odd-symmetric for every value', () => {
    fc.assert(
      fc.property(fc.double({ min: -1e9, max: 1e9, noNaN: true }), (value) => {
        expect(roundHalfAwayFromZero(-value) + roundHalfAwayFromZero(value)).toBe(0);
      }),
    );
  });
});

describe('sumMinorUnits', () => {
  it('adds integers and rejects fractions', () => {
    expect(sumMinorUnits([100, 250, -50])).toBe(300);
    expect(sumMinorUnits([])).toBe(0);
    expect(() => sumMinorUnits([1.5])).toThrow(/whole number/);
  });
});

describe('applyBasisPoints', () => {
  it('computes percentages in basis points', () => {
    expect(applyBasisPoints(10_000, 1000)).toBe(1000);
    expect(applyBasisPoints(999, 1250)).toBe(125);
  });

  it('rejects fractional basis points', () => {
    expect(() => applyBasisPoints(100, 12.5)).toThrow(MoneyError);
  });
});

describe('extractInclusiveTax', () => {
  it('extracts 12% GST from an inclusive price', () => {
    expect(extractInclusiveTax(1120_00, 1200)).toEqual({ net: 1000_00, tax: 120_00 });
    expect(extractInclusiveTax(2499_00, 1200)).toEqual({ net: 223125, tax: 26775 });
  });

  it('returns zero tax at a zero rate', () => {
    expect(extractInclusiveTax(5000, 0)).toEqual({ net: 5000, tax: 0 });
  });

  it('rejects negative or fractional rates', () => {
    expect(() => extractInclusiveTax(100, -1)).toThrow(MoneyError);
    expect(() => extractInclusiveTax(100, 1.5)).toThrow(MoneyError);
  });

  it('always splits into parts that add back up to the gross', () => {
    fc.assert(
      fc.property(amount, fc.integer({ min: 0, max: 5000 }), (gross, rate) => {
        const { net, tax } = extractInclusiveTax(gross, rate);
        expect(net + tax).toBe(gross);
        expect(Number.isInteger(tax)).toBe(true);
        expect(Math.abs(tax)).toBeLessThanOrEqual(Math.abs(gross));
      }),
    );
  });
});

describe('parseMajorUnits', () => {
  it('parses decimal strings without floating point error', () => {
    expect(parseMajorUnits('2499')).toBe(249900);
    expect(parseMajorUnits('0.1')).toBe(10);
    expect(parseMajorUnits('19.99', usd)).toBe(1999);
    expect(parseMajorUnits('-5.5')).toBe(-550);
    expect(parseMajorUnits('1200', jpy)).toBe(1200);
  });

  it('rejects malformed input and excess precision', () => {
    expect(() => parseMajorUnits('12.345')).toThrow(/decimal places/);
    expect(() => parseMajorUnits('1.5', jpy)).toThrow(/decimal places/);
    expect(() => parseMajorUnits('1,000')).toThrow(/not a valid amount/);
    expect(() => parseMajorUnits('')).toThrow(MoneyError);
  });

  it('round-trips with minor units', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1_000_000_000 }), (minor) => {
        const major = `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, '0')}`;
        expect(parseMajorUnits(major, usd)).toBe(minor);
      }),
    );
  });
});

describe('formatMoney', () => {
  it('formats INR in the Indian numbering system by default and hides .00', () => {
    expect(formatMoney(1_24_999_00)).toBe('₹1,24,999');
    expect(formatMoney(2499_50)).toBe('₹2,499.50');
  });

  it('can keep the fraction on whole amounts', () => {
    expect(formatMoney(2499_00, { trimWholeFraction: false })).toBe('₹2,499.00');
  });

  it('follows the market it is given', () => {
    expect(formatMoney(1999, { market: usd })).toBe('$19.99');
    expect(formatMoney(1200, { market: jpy })).toBe('￥1,200');
  });

  it('refuses fractional minor units', () => {
    expect(() => formatMoney(10.5)).toThrow(MoneyError);
  });
});
