import { commerce } from '@optical/config/commerce';
import { formatMoney } from '@optical/shared/money';

/** Price for display, e.g. ₹2,490. */
export function formatPrice(amountMinor: number): string {
  return formatMoney(amountMinor);
}

const dateFormatter = new Intl.DateTimeFormat(commerce.locale, {
  day: 'numeric',
  month: 'short',
  timeZone: commerce.timeZone,
});
const longDateFormatter = new Intl.DateTimeFormat(commerce.locale, {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: commerce.timeZone,
});

/** "4 Oct" from an ISO date or YYYY-MM-DD. */
export function formatShortDate(value: string | Date): string {
  return dateFormatter.format(
    typeof value === 'string'
      ? new Date(value.length === 10 ? `${value}T12:00:00Z` : value)
      : value,
  );
}

/** "4 October 2026". */
export function formatLongDate(value: string | Date): string {
  return longDateFormatter.format(typeof value === 'string' ? new Date(value) : value);
}

/** Millimetres with at most one decimal: "52 mm", "41.5 mm". */
export function formatMm(value: number): string {
  return `${Number.isInteger(value) ? value : value.toFixed(1)} mm`;
}
