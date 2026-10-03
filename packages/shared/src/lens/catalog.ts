import { z } from 'zod';
import { rimTypeSchema } from '../catalog/enums';

/**
 * The lens catalogue as data. Everything a customer can choose, with its
 * price and plain-language copy, lives in the database and is editable
 * from admin; this file only defines its shape.
 */
export const lensPurposes = [
  'zero-power',
  'single-vision',
  'progressive',
  'computer',
  'sun-rx',
] as const;
export const lensPurposeSchema = z.enum(lensPurposes);
export type LensPurpose = z.infer<typeof lensPurposeSchema>;

export const tintKinds = ['clear', 'photochromic', 'solid', 'gradient', 'polarised'] as const;
export const tintKindSchema = z.enum(tintKinds);
export type TintKind = z.infer<typeof tintKindSchema>;

const code = z.string().regex(/^[a-z0-9.-]{1,40}$/);
const minor = z.number().int().nonnegative();

export const lensPurposeOptionSchema = z.object({
  code: lensPurposeSchema,
  name: z.string(),
  description: z.string(),
  basePriceMinor: minor,
  requiresPrescription: z.boolean(),
  requiresAdd: z.boolean(),
  /** Coatings that come with this lens type at no extra cost (e.g. blue-light on computer lenses). */
  includedCoatingCodes: z.array(code),
  /** Index used when the customer doesn't choose one (lenses without power). */
  defaultIndexCode: code,
  defaultTintCode: code,
});
export type LensPurposeOption = z.infer<typeof lensPurposeOptionSchema>;

export const lensIndexOptionSchema = z.object({
  code,
  refractiveIndex: z.number().min(1.4).max(1.9),
  name: z.string(),
  description: z.string(),
  priceMinor: minor,
  /** Strongest power (in any meridian) this material is made in. */
  maxPower: z.number().positive(),
  /** Up to this power, this is the index we recommend. */
  recommendedUpTo: z.number().nonnegative(),
});
export type LensIndexOption = z.infer<typeof lensIndexOptionSchema>;

export const lensCoatingSchema = z.object({
  code,
  name: z.string(),
  benefit: z.string(),
  priceMinor: minor,
});
export type LensCoating = z.infer<typeof lensCoatingSchema>;

export const lensPackageSchema = z.object({
  code,
  name: z.string(),
  description: z.string(),
  coatingCodes: z.array(code).min(1),
  priceMinor: minor,
});
export type LensPackage = z.infer<typeof lensPackageSchema>;

export const lensTintColourSchema = z.object({
  code,
  name: z.string(),
  hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
});

export const lensTintSchema = z.object({
  code,
  kind: tintKindSchema,
  name: z.string(),
  description: z.string(),
  priceMinor: minor,
  colours: z.array(lensTintColourSchema),
  supportsIntensity: z.boolean(),
});
export type LensTint = z.infer<typeof lensTintSchema>;

export const optionTypes = ['purpose', 'index', 'coating', 'package', 'tint'] as const;
export const optionRefSchema = z.object({ type: z.enum(optionTypes), code });
export type OptionRef = z.infer<typeof optionRefSchema>;

export const ruleConditionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('purpose-in'), codes: z.array(lensPurposeSchema).min(1) }),
  z.object({ type: z.literal('selected'), option: optionRefSchema }),
  z.object({ type: z.literal('rim-type-in'), rimTypes: z.array(rimTypeSchema).min(1) }),
  z.object({ type: z.literal('lens-height-below'), mm: z.number().positive() }),
  z.object({ type: z.literal('power-above'), dioptres: z.number().nonnegative() }),
]);
export type RuleCondition = z.infer<typeof ruleConditionSchema>;

/**
 * "When every condition holds, this option is not available, because …".
 * An empty `when` makes the option unavailable unconditionally.
 */
export const lensRuleSchema = z.object({
  id: z.string(),
  when: z.array(ruleConditionSchema),
  forbid: optionRefSchema,
  /** Shown to the customer next to the disabled option. */
  reason: z.string(),
});
export type LensRule = z.infer<typeof lensRuleSchema>;

export const lensCatalogSchema = z
  .object({
    purposes: z.array(lensPurposeOptionSchema).min(1),
    indexes: z.array(lensIndexOptionSchema).min(1),
    coatings: z.array(lensCoatingSchema),
    packages: z.array(lensPackageSchema),
    tints: z.array(lensTintSchema).min(1),
    rules: z.array(lensRuleSchema),
  })
  .meta({ id: 'LensCatalog' });
export type LensCatalog = z.infer<typeof lensCatalogSchema>;
