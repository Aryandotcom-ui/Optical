import { z } from 'zod';
import { lensConfigSchema } from './config';

/** Request and response contracts for the lens endpoints. */
export const lensQuoteRequestSchema = z
  .object({
    /** The frame the lenses are for; its rim type and lens size drive the rules. */
    productId: z.uuid(),
    config: lensConfigSchema,
  })
  .meta({ id: 'LensQuoteRequest' });
export type LensQuoteRequest = z.infer<typeof lensQuoteRequestSchema>;

const availabilitySchema = z.object({ available: z.boolean(), reason: z.string().nullable() });
const availabilityMapSchema = z.object({
  purposes: z.record(z.string(), availabilitySchema),
  indexes: z.record(z.string(), availabilitySchema),
  coatings: z.record(z.string(), availabilitySchema),
  packages: z.record(z.string(), availabilitySchema),
  tints: z.record(z.string(), availabilitySchema),
});

export const lensQuoteLineSchema = z.object({
  kind: z.enum(['base', 'index', 'package', 'coating', 'tint']),
  code: z.string(),
  label: z.string(),
  priceMinor: z.number().int().nonnegative(),
});

const rxIssueSchema = z.object({
  path: z.string(),
  message: z.string(),
  severity: z.enum(['error', 'warning']),
});

/**
 * An invalid configuration is a normal step while a customer configures
 * lenses, so it comes back as `valid: false` with reasons, not as an HTTP
 * error. Availability is always included so the UI can disable options.
 */
export const lensQuoteResponseSchema = z
  .discriminatedUnion('valid', [
    z.object({
      valid: z.literal(true),
      config: lensConfigSchema,
      lines: z.array(lensQuoteLineSchema),
      totalMinor: z.number().int().nonnegative(),
      warnings: z.array(rxIssueSchema),
      recommendation: z.object({ indexCode: z.string(), reason: z.string() }).nullable(),
      thickness: z
        .array(
          z.object({
            indexCode: z.string(),
            estimate: z.object({ centreMm: z.number(), edgeMm: z.number(), maxMm: z.number() }),
          }),
        )
        .nullable(),
      availability: availabilityMapSchema,
    }),
    z.object({
      valid: z.literal(false),
      errors: z.array(z.object({ path: z.string(), code: z.string(), message: z.string() })),
      availability: availabilityMapSchema,
    }),
  ])
  .meta({ id: 'LensQuote' });
export type LensQuoteResponse = z.infer<typeof lensQuoteResponseSchema>;
