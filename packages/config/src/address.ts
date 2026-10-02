/**
 * Address rules per market: what the first-level division is called and
 * its list, phone number format, and the postal-code lookup that pre-fills
 * a delivery address. Kept apart from the core market settings because only
 * checkout needs this data, so it never weighs down other pages.
 */
import { commerce, isValidPostalCode, type CommerceConfig } from './commerce';
import { indiaAddress } from './india-address';

export interface PhoneConfig {
  /** International dialling code, e.g. "+91". */
  readonly dialCode: string;
  /** Source of a RegExp that the national number (digits only) must fully match. */
  readonly pattern: string;
  readonly example: string;
}

export interface PostalLookupEntry {
  /** Leading digits of the postal code; the longest matching prefix wins. */
  readonly prefix: string;
  readonly region: string;
  readonly city: string | null;
}

export interface AddressConfig {
  /** What the first-level division is called: "State", "County", "Province". */
  readonly regionLabel: string;
  readonly regions: readonly string[];
  readonly phone: PhoneConfig;
  /** Pre-fills region (and city, where known) from a postal code. */
  readonly postalLookup: readonly PostalLookupEntry[];
}

/** Address rules by market country. */
const addressConfigs: Partial<Record<string, AddressConfig>> = { IN: indiaAddress };

export function addressConfigFor(market: CommerceConfig = commerce): AddressConfig {
  const config = addressConfigs[market.country];
  if (!config) throw new Error(`No address rules for market ${market.country}.`);
  return config;
}

/** The active market's address rules. */
export const addressConfig: AddressConfig = addressConfigFor(commerce);

/** Region and city for a postal code, by longest matching prefix, or null when unknown. */
export function lookupPostalCode(
  code: string,
  market: CommerceConfig = commerce,
): { region: string; city: string | null } | null {
  const trimmed = code.trim();
  if (!isValidPostalCode(trimmed, market)) return null;
  let best: PostalLookupEntry | undefined;
  for (const entry of addressConfigFor(market).postalLookup) {
    if (!trimmed.startsWith(entry.prefix)) continue;
    const length = best?.prefix.length ?? 0;
    // On a tie, an entry that also knows the city wins.
    if (entry.prefix.length > length || (entry.prefix.length === length && !best?.city))
      best = entry;
  }
  return best ? { region: best.region, city: best.city } : null;
}

/**
 * Normalises a phone number to international form (+919876543210), or
 * returns null when it isn't a valid number for the market. Accepts spaces,
 * dashes, brackets, a leading 0 and the country code.
 */
export function normalisePhone(input: string, market: CommerceConfig = commerce): string | null {
  const { dialCode, pattern } = addressConfigFor(market).phone;
  let digits = input.replace(/[\s()-]/g, '');
  if (digits.startsWith(dialCode)) digits = digits.slice(dialCode.length);
  else if (digits.startsWith(`00${dialCode.slice(1)}`)) digits = digits.slice(dialCode.length + 1);
  else if (digits.startsWith('0')) digits = digits.slice(1);
  if (!/^[0-9]+$/.test(digits) || !new RegExp(pattern).test(digits)) return null;
  return `${dialCode}${digits}`;
}
