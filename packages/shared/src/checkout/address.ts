import {
  commerce,
  isValidPostalCode,
  normalisePhone,
  type CommerceConfig,
} from '@optical/config/commerce';
import { z } from 'zod';

const text = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .min(min, `${label} is required.`)
    .max(max, `${label} can be at most ${max} characters.`);

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} can be at most ${max} characters.`)
    .transform((value) => value || null)
    .nullish()
    .transform((value) => value ?? null);

/** Phone number in the market's format, normalised to international form. */
export function phoneSchema(market: CommerceConfig = commerce) {
  return z.string().transform((value, ctx) => {
    const phone = normalisePhone(value, market);
    if (!phone) {
      ctx.addIssue({
        code: 'custom',
        message: `Enter a 10-digit mobile number, like ${market.address.phone.example}.`,
      });
      return z.NEVER;
    }
    return phone;
  });
}

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'That email address is too long.')
  .pipe(z.email('Enter an email address like name@example.com.'));

/**
 * A delivery address, validated against the market's rules (postal code
 * pattern, region list). The contact phone travels with it on the order
 * snapshot, for the courier.
 */
export function shippingAddressSchema(market: CommerceConfig = commerce) {
  return z
    .object({
      fullName: text(2, 80, 'Full name'),
      line1: text(3, 120, 'Address'),
      line2: optionalText(120, 'Address line 2'),
      landmark: optionalText(80, 'Landmark'),
      city: text(2, 60, 'City'),
      region: z
        .string()
        .trim()
        .refine((value) => market.address.regions.includes(value), {
          message: `Choose your ${market.address.regionLabel.toLowerCase()}.`,
        }),
      postalCode: z
        .string()
        .trim()
        .refine((value) => isValidPostalCode(value, market), {
          message: `Enter a valid ${market.postalCode.label}, like ${market.postalCode.example}.`,
        }),
      country: z.literal(market.country).default(market.country),
    })
    .meta({ id: 'ShippingAddress' });
}

export const addressSchema = shippingAddressSchema();
export type ShippingAddress = z.infer<typeof addressSchema>;
export type ShippingAddressInput = z.input<typeof addressSchema>;
