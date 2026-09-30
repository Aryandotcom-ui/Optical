import { z } from 'zod';
import { prescriptionSchema } from '../rx/prescription';
import { lensPurposeSchema } from './catalog';

/** How the customer provides their prescription. */
export const prescriptionSourceSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('manual'), rx: prescriptionSchema }),
  z.object({ mode: z.literal('upload'), uploadId: z.string().min(1) }),
  z.object({ mode: z.literal('saved'), prescriptionId: z.string().min(1) }),
  /** Order is held in PRESCRIPTION_REVIEW until the prescription arrives. */
  z.object({ mode: z.literal('later') }),
]);
export type PrescriptionSource = z.infer<typeof prescriptionSourceSchema>;

export const TINT_INTENSITY = { min: 10, max: 90, default: 60 } as const;

/** A customer's lens choices. Stored as an immutable snapshot on cart and order items. */
export const lensConfigSchema = z
  .object({
    purpose: lensPurposeSchema,
    prescription: prescriptionSourceSchema.nullable().default(null),
    indexCode: z.string().nullable().default(null),
    packageCode: z.string().nullable().default(null),
    extraCoatingCodes: z.array(z.string()).max(10).default([]),
    tint: z
      .object({
        code: z.string(),
        colourCode: z.string().nullable().default(null),
        intensity: z.number().int().nullable().default(null),
      })
      .nullable()
      .default(null),
  })
  .meta({ id: 'LensConfig' });
export type LensConfig = z.infer<typeof lensConfigSchema>;
export type LensConfigInput = z.input<typeof lensConfigSchema>;

/** The parts of a frame that constrain which lenses fit it. */
export const lensFrameContextSchema = z.object({
  rimType: z.enum(['full-rim', 'half-rim', 'rimless']),
  lensHeightMm: z.number().positive(),
  lensWidthMm: z.number().positive(),
});
export type LensFrameContext = z.infer<typeof lensFrameContextSchema>;
