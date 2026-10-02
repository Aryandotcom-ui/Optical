import { z } from 'zod';
import type { EyeRx, Prescription, PupillaryDistance } from './validate';

/**
 * Prescription schemas for the API. Validation rules and messages live in
 * `./validate`, which has no Zod so the browser can use it too; messages
 * are written for customers, not opticians, and each points at one field.
 */
const num = z.number();

export const eyeRxSchema = z.object({
  sph: num,
  cyl: num.nullable().default(null),
  axis: num.nullable().default(null),
  add: num.nullable().default(null),
}) satisfies z.ZodType<EyeRx>;

export const pdSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('single'), value: num }),
  z.object({ kind: z.literal('dual'), right: num, left: num }),
]) satisfies z.ZodType<PupillaryDistance>;

export const prescriptionSchema = z
  .object({
    /** OD, the right eye. */
    right: eyeRxSchema,
    /** OS, the left eye. */
    left: eyeRxSchema,
    pd: pdSchema,
  })
  .meta({ id: 'Prescription' }) satisfies z.ZodType<Prescription>;
export type PrescriptionInput = z.input<typeof prescriptionSchema>;

export * from './validate';
