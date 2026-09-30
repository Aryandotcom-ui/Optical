import { z } from 'zod';

/**
 * Catalogue vocabularies. These are the values stored in the database, used
 * in URLs and filters, and shown (via translated labels) in the UI.
 */
export const categorySlugs = [
  'eyeglasses',
  'sunglasses',
  'computer-glasses',
  'kids',
  'accessories',
] as const;
export const categorySlugSchema = z.enum(categorySlugs);
export type CategorySlug = z.infer<typeof categorySlugSchema>;

export const productTypes = ['frame', 'accessory'] as const;
export const productTypeSchema = z.enum(productTypes);
export type ProductType = z.infer<typeof productTypeSchema>;

export const frameShapes = [
  'round',
  'rectangle',
  'square',
  'aviator',
  'cat-eye',
  'wayfarer',
  'browline',
  'hexagon',
] as const;
export const frameShapeSchema = z.enum(frameShapes);
export type FrameShape = z.infer<typeof frameShapeSchema>;

export const frameMaterials = ['acetate', 'metal', 'titanium', 'tr90', 'mixed'] as const;
export const frameMaterialSchema = z.enum(frameMaterials);
export type FrameMaterial = z.infer<typeof frameMaterialSchema>;

export const rimTypes = ['full-rim', 'half-rim', 'rimless'] as const;
export const rimTypeSchema = z.enum(rimTypes);
export type RimType = z.infer<typeof rimTypeSchema>;

export const hingeTypes = ['standard', 'spring'] as const;
export const hingeTypeSchema = z.enum(hingeTypes);
export type HingeType = z.infer<typeof hingeTypeSchema>;

/** Surface look used by the 3D renderer and the listing swatches. */
export const frameFinishes = [
  'glossy',
  'matte',
  'tortoise',
  'gradient',
  'metallic',
  'crystal',
] as const;
export const frameFinishSchema = z.enum(frameFinishes);
export type FrameFinish = z.infer<typeof frameFinishSchema>;

export const frameSizes = ['small', 'medium', 'large'] as const;
export const frameSizeSchema = z.enum(frameSizes);
export type FrameSize = z.infer<typeof frameSizeSchema>;

export const frameFits = ['women', 'men', 'unisex', 'kids'] as const;
export const frameFitSchema = z.enum(frameFits);
export type FrameFit = z.infer<typeof frameFitSchema>;

export const frameFeatures = ['spring-hinges', 'nose-pads', 'lightweight', 'adjustable'] as const;
export const frameFeatureSchema = z.enum(frameFeatures);
export type FrameFeature = z.infer<typeof frameFeatureSchema>;

export const faceShapes = ['oval', 'round', 'square', 'heart', 'oblong', 'diamond'] as const;
export const faceShapeSchema = z.enum(faceShapes);
export type FaceShape = z.infer<typeof faceShapeSchema>;

/** Colour families for filter swatches; each variant maps to exactly one. */
export const colourFamilies = [
  'black',
  'tortoise',
  'brown',
  'grey',
  'clear',
  'blue',
  'green',
  'red',
  'pink',
  'beige',
  'gold',
  'silver',
  'gunmetal',
  'rose-gold',
] as const;
export const colourFamilySchema = z.enum(colourFamilies);
export type ColourFamily = z.infer<typeof colourFamilySchema>;

export const listingSorts = ['recommended', 'newest', 'price-asc', 'price-desc', 'rating'] as const;
export const listingSortSchema = z.enum(listingSorts);
export type ListingSort = z.infer<typeof listingSortSchema>;

/**
 * Frame size bands by total frame width in millimetres. Bands are half-open:
 * small < 132 ≤ medium < 140 ≤ large.
 */
export const frameSizeBandsMm = {
  small: { max: 132 },
  medium: { min: 132, max: 140 },
  large: { min: 140 },
} as const;

/** Classifies a frame's total width into a size band. */
export function frameSizeForWidth(totalWidthMm: number): FrameSize {
  if (totalWidthMm < frameSizeBandsMm.medium.min) return 'small';
  if (totalWidthMm < frameSizeBandsMm.large.min) return 'medium';
  return 'large';
}

/** Honest stock label: a low-stock notice only appears when stock is genuinely three or fewer. */
export const LOW_STOCK_THRESHOLD = 3;
export type StockState = 'in-stock' | 'low-stock' | 'out-of-stock';

export function stockStateFor(available: number): StockState {
  if (available <= 0) return 'out-of-stock';
  if (available <= LOW_STOCK_THRESHOLD) return 'low-stock';
  return 'in-stock';
}
