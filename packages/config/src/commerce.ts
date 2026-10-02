/**
 * Market configuration: currency, tax, address rules, shipping and store
 * policies. Nothing else in the codebase assumes a country; add a new market
 * by adding another `CommerceConfig` and selecting it.
 *
 * All money values are integer minor units (paise for INR).
 */
export interface TaxConfig {
  /** Label printed on invoices, e.g. "GST" or "VAT". */
  readonly name: string;
  /** Rate in basis points (1200 = 12%). */
  readonly rateBasisPoints: number;
  /** When true, catalogue prices already include tax and tax is extracted, not added. */
  readonly pricesIncludeTax: boolean;
}

export interface PostalCodeConfig {
  /** What customers call it: "PIN code", "ZIP code", "Postcode". */
  readonly label: string;
  /** Source of a RegExp that a valid code must fully match. */
  readonly pattern: string;
  readonly example: string;
}

export interface ShippingZone {
  readonly code: string;
  readonly name: string;
  /** Postal-code prefixes in this zone; the longest matching prefix wins. */
  readonly postalPrefixes: readonly string[];
  /** Added to every delivery in the zone, whatever the speed or free-shipping status. */
  readonly surchargeMinor: number;
  /** Business days added to the transit time. */
  readonly extraTransitDays: number;
}

export interface ShippingConfig {
  /** Orders at or above this subtotal (after discounts) ship free on the standard speed. */
  readonly freeShippingThresholdMinor: number;
  readonly standardFeeMinor: number;
  readonly expressFeeMinor: number;
  /** Business days in transit after dispatch. */
  readonly transitDays: { readonly standard: number; readonly express: number };
  /** Zones with special handling; codes matching none use `defaultZoneCode`. */
  readonly zones: readonly ShippingZone[];
  readonly defaultZoneCode: string;
  /** Days of the week (0 = Sunday) on which nothing is dispatched or delivered. */
  readonly nonWorkingWeekdays: readonly number[];
}

export interface CashOnDeliveryConfig {
  readonly enabled: boolean;
  /** Orders above this total cannot use COD. */
  readonly maxOrderTotalMinor: number;
  readonly feeMinor: number;
}

export interface PolicyConfig {
  readonly returnWindowDays: number;
  readonly frameWarrantyMonths: number;
  /** Business days from order to dispatch for frames without prescription lenses. */
  readonly dispatchDaysFrameOnly: number;
  /** Business days from prescription approval to dispatch for made-to-order lenses. */
  readonly dispatchDaysPrescription: number;
  /** Minutes a unit of stock is held while a customer completes payment. */
  readonly stockReservationMinutes: number;
}

export interface CommerceConfig {
  /** ISO 3166-1 alpha-2 country code of the market. */
  readonly country: string;
  /** ISO 4217 currency code. */
  readonly currency: string;
  /** Number of minor units in one major unit (100 for INR, USD, EUR). */
  readonly minorUnitsPerMajor: number;
  /** BCP 47 locale for number, currency and date formatting. */
  readonly locale: string;
  readonly timeZone: string;
  readonly tax: TaxConfig;
  readonly postalCode: PostalCodeConfig;
  readonly shipping: ShippingConfig;
  readonly cashOnDelivery: CashOnDeliveryConfig;
  readonly policies: PolicyConfig;
}

export const indiaMarket: CommerceConfig = {
  country: 'IN',
  currency: 'INR',
  minorUnitsPerMajor: 100,
  locale: 'en-IN',
  timeZone: 'Asia/Kolkata',
  tax: { name: 'GST', rateBasisPoints: 1200, pricesIncludeTax: true },
  postalCode: { label: 'PIN code', pattern: '^[1-9][0-9]{5}$', example: '560001' },
  shipping: {
    freeShippingThresholdMinor: 1_499_00,
    standardFeeMinor: 99_00,
    expressFeeMinor: 249_00,
    transitDays: { standard: 4, express: 2 },
    zones: [
      {
        code: 'metro',
        name: 'Metro cities',
        // Delhi, Mumbai, Bengaluru, Chennai, Kolkata, Hyderabad
        postalPrefixes: ['110', '400', '560', '600', '700', '500'],
        surchargeMinor: 0,
        extraTransitDays: -1,
      },
      {
        code: 'rest-of-india',
        name: 'Rest of India',
        postalPrefixes: [],
        surchargeMinor: 0,
        extraTransitDays: 0,
      },
      {
        code: 'remote',
        name: 'Remote areas',
        // Jammu & Kashmir and Ladakh, the North East, Andaman & Nicobar
        postalPrefixes: ['190', '191', '192', '193', '194', '78', '79', '744'],
        surchargeMinor: 50_00,
        extraTransitDays: 3,
      },
    ],
    defaultZoneCode: 'rest-of-india',
    nonWorkingWeekdays: [0],
  },
  cashOnDelivery: { enabled: true, maxOrderTotalMinor: 15_000_00, feeMinor: 49_00 },
  policies: {
    returnWindowDays: 14,
    frameWarrantyMonths: 12,
    dispatchDaysFrameOnly: 2,
    dispatchDaysPrescription: 5,
    stockReservationMinutes: 15,
  },
};

/** The active market. Phase 6 makes these values editable from admin settings. */
export const commerce: CommerceConfig = indiaMarket;

/** Finds the shipping zone for a postal code by longest matching prefix. */
export function shippingZoneFor(
  postalCode: string | null | undefined,
  market: CommerceConfig = commerce,
): ShippingZone {
  const code = postalCode?.trim() ?? '';
  let best: { zone: ShippingZone; length: number } | undefined;
  for (const zone of market.shipping.zones) {
    for (const prefix of zone.postalPrefixes) {
      if (code.startsWith(prefix) && prefix.length > (best?.length ?? 0))
        best = { zone, length: prefix.length };
    }
  }
  if (best) return best.zone;
  const fallback = market.shipping.zones.find(
    (zone) => zone.code === market.shipping.defaultZoneCode,
  );
  if (!fallback)
    throw new Error(`Default shipping zone "${market.shipping.defaultZoneCode}" is not defined.`);
  return fallback;
}

/** Returns true when `code` is a valid postal code for the given market. */
export function isValidPostalCode(code: string, market: CommerceConfig = commerce): boolean {
  return new RegExp(market.postalCode.pattern).test(code.trim());
}
