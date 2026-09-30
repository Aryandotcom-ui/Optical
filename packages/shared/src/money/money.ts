import { commerce, type CommerceConfig } from '@optical/config/commerce';

/**
 * Money is always an integer count of minor units (paise, cents).
 * Floating-point amounts never enter the domain; convert at the edges only.
 */
export type MinorUnits = number;

export class MoneyError extends Error {
  override name = 'MoneyError';
}

/** Throws unless `value` is a safe integer amount of minor units. */
export function assertMinorUnits(value: number, label = 'amount'): asserts value is MinorUnits {
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`${label} must be a whole number of minor units, got ${String(value)}.`);
  }
}

/**
 * Rounds half away from zero (2.5 → 3, −2.5 → −3). This is the rounding rule
 * for every money calculation, so results never depend on the sign.
 */
export function roundHalfAwayFromZero(value: number): number {
  if (!Number.isFinite(value)) throw new MoneyError(`Cannot round ${String(value)}.`);
  const rounded = Math.round(Math.abs(value));
  return value < 0 ? -rounded : rounded;
}

/** Sums amounts of minor units, rejecting anything that is not a safe integer. */
export function sumMinorUnits(values: readonly MinorUnits[]): MinorUnits {
  let total = 0;
  for (const value of values) {
    assertMinorUnits(value);
    total += value;
  }
  assertMinorUnits(total, 'total');
  return total;
}

/** Applies a rate in basis points (1200 = 12%) to an amount, rounding once. */
export function applyBasisPoints(amount: MinorUnits, basisPoints: number): MinorUnits {
  assertMinorUnits(amount);
  if (!Number.isInteger(basisPoints)) throw new MoneyError('Basis points must be an integer.');
  return roundHalfAwayFromZero((amount * basisPoints) / 10_000);
}

/**
 * Splits a tax-inclusive gross amount into net and tax.
 * tax = gross × rate ÷ (1 + rate), rounded once; net = gross − tax, so the
 * parts always add back up to the gross exactly.
 */
export function extractInclusiveTax(
  gross: MinorUnits,
  rateBasisPoints: number,
): { net: MinorUnits; tax: MinorUnits } {
  assertMinorUnits(gross, 'gross');
  if (!Number.isInteger(rateBasisPoints) || rateBasisPoints < 0) {
    throw new MoneyError('Tax rate must be a non-negative integer number of basis points.');
  }
  const tax = roundHalfAwayFromZero((gross * rateBasisPoints) / (10_000 + rateBasisPoints));
  return { net: gross - tax, tax };
}

/** Converts a major-unit decimal string such as "2499.50" to minor units without float error. */
export function parseMajorUnits(
  input: string,
  market: Pick<CommerceConfig, 'minorUnitsPerMajor'> = commerce,
): MinorUnits {
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(input.trim());
  if (!match) throw new MoneyError(`"${input}" is not a valid amount.`);
  const [, sign, whole = '0', fraction = ''] = match;
  const digits = Math.round(Math.log10(market.minorUnitsPerMajor));
  if (fraction.length > digits) {
    throw new MoneyError(`"${input}" has more than ${digits} decimal places.`);
  }
  const minor =
    Number(whole) * market.minorUnitsPerMajor + Number(fraction.padEnd(digits, '0') || 0);
  assertMinorUnits(minor);
  return sign ? -minor : minor;
}

export interface FormatMoneyOptions {
  market?: Pick<CommerceConfig, 'currency' | 'locale' | 'minorUnitsPerMajor'>;
  /** Hide ".00" on whole amounts (₹2,499 rather than ₹2,499.00). Defaults to true. */
  trimWholeFraction?: boolean;
}

const formatterCache = new Map<string, Intl.NumberFormat>();

function formatterFor(locale: string, currency: string, fractionDigits: number | undefined) {
  const key = `${locale}|${currency}|${String(fractionDigits)}`;
  let formatter = formatterCache.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      ...(fractionDigits === undefined
        ? {}
        : { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits }),
    });
    formatterCache.set(key, formatter);
  }
  return formatter;
}

/** Formats minor units as a localised currency string using `Intl.NumberFormat`. */
export function formatMoney(amount: MinorUnits, options: FormatMoneyOptions = {}): string {
  assertMinorUnits(amount);
  const market = options.market ?? commerce;
  const trim = options.trimWholeFraction ?? true;
  const isWhole = amount % market.minorUnitsPerMajor === 0;
  const formatter = formatterFor(market.locale, market.currency, trim && isWhole ? 0 : undefined);
  return formatter.format(amount / market.minorUnitsPerMajor);
}
