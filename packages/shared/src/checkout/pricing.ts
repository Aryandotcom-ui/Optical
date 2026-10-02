import { z } from 'zod';
import { couponRejections } from '../pricing/coupon';

const minor = z.number().int();

const priceLineSchema = z.object({
  itemKey: z.string(),
  kind: z.string(),
  code: z.string().nullable(),
  label: z.string(),
  unitPriceMinor: minor,
  quantity: z.number().int(),
  amountMinor: minor,
  discountMinor: minor,
  taxMinor: minor,
});

/** The pricing engine's result, as the API returns it. Every amount is in minor units. */
export const pricingSchema = z
  .object({
    currency: z.string(),
    lines: z.array(priceLineSchema),
    subtotalMinor: minor,
    discountMinor: minor,
    shipping: z.object({
      speed: z.enum(['standard', 'express']),
      zoneCode: z.string(),
      feeMinor: minor,
      freeStandard: z.boolean(),
      remainingForFreeMinor: minor,
      taxMinor: minor,
    }),
    codFee: z.object({ feeMinor: minor, taxMinor: minor }),
    totalMinor: minor,
    tax: z.object({
      name: z.string(),
      rateBasisPoints: z.number().int(),
      totalMinor: minor,
      netMinor: minor,
    }),
    coupon: z
      .discriminatedUnion('applied', [
        z.object({
          code: z.string(),
          applied: z.literal(true),
          discountMinor: minor,
          freeShipping: z.boolean(),
        }),
        z.object({
          code: z.string(),
          applied: z.literal(false),
          reason: z.enum(couponRejections),
          message: z.string(),
        }),
      ])
      .nullable(),
    cashOnDelivery: z.object({ available: z.boolean(), reason: z.string().nullable() }),
    issues: z.array(
      z.object({ code: z.string(), itemKey: z.string().optional(), message: z.string() }),
    ),
  })
  .meta({ id: 'Pricing' });
export type Pricing = z.infer<typeof pricingSchema>;
