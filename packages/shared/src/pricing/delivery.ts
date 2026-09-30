import { commerce, shippingZoneFor, type CommerceConfig } from '@optical/config/commerce';
import type { ShippingSpeed } from './engine';

export interface DeliveryEstimate {
  zoneCode: string;
  /** Business days from order (or prescription approval) to dispatch. */
  dispatchDays: number;
  transitDays: number;
  /** Calendar dates, YYYY-MM-DD in the market's time zone. */
  earliest: string;
  latest: string;
}

/** Extra business days between the earliest and latest estimate. */
const ESTIMATE_WINDOW_DAYS = 2;

/** The calendar date (YYYY-MM-DD) of an instant in a time zone. */
export function localIsoDate(instant: Date, timeZone: string): string {
  // en-CA formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

/** Adds business days to a calendar date, skipping the market's non-working weekdays. */
export function addBusinessDays(
  isoDate: string,
  days: number,
  nonWorkingWeekdays: readonly number[],
): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  let remaining = days;
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    if (!nonWorkingWeekdays.includes(date.getUTCDay())) remaining -= 1;
  }
  return date.toISOString().slice(0, 10);
}

/**
 * Estimates when an order arrives. Prescription lenses are made to order,
 * so they take longer to dispatch than frames alone. The window is
 * deliberately honest: a range, never a promise to the day.
 */
export function estimateDelivery(input: {
  orderedAt: Date;
  speed: ShippingSpeed;
  postalCode?: string | null;
  needsLensProduction: boolean;
  market?: CommerceConfig;
}): DeliveryEstimate {
  const market = input.market ?? commerce;
  const zone = shippingZoneFor(input.postalCode, market);
  const { policies, shipping } = market;
  const dispatchDays = input.needsLensProduction
    ? policies.dispatchDaysPrescription
    : policies.dispatchDaysFrameOnly;
  const transitDays = Math.max(1, shipping.transitDays[input.speed] + zone.extraTransitDays);

  const orderDate = localIsoDate(input.orderedAt, market.timeZone);
  const earliest = addBusinessDays(
    orderDate,
    dispatchDays + transitDays,
    shipping.nonWorkingWeekdays,
  );
  const latest = addBusinessDays(earliest, ESTIMATE_WINDOW_DAYS, shipping.nonWorkingWeekdays);
  return { zoneCode: zone.code, dispatchDays, transitDays, earliest, latest };
}
