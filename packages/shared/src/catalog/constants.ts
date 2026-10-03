/**
 * Catalogue vocabularies and plain helpers, with no runtime dependencies so
 * they are cheap to use in browser bundles. Zod schemas built from these
 * live in enums.ts.
 *
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
export type CategorySlug = (typeof categorySlugs)[number];

export const productTypes = ['frame', 'accessory'] as const;
export type ProductType = (typeof productTypes)[number];

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
export type FrameShape = (typeof frameShapes)[number];

export const frameMaterials = ['acetate', 'metal', 'titanium', 'tr90', 'mixed'] as const;
export type FrameMaterial = (typeof frameMaterials)[number];

export const rimTypes = ['full-rim', 'half-rim', 'rimless'] as const;
export type RimType = (typeof rimTypes)[number];

export const hingeTypes = ['standard', 'spring'] as const;
export type HingeType = (typeof hingeTypes)[number];

/** Surface look used by the 3D renderer and the listing swatches. */
export const frameFinishes = [
  'glossy',
  'matte',
  'tortoise',
  'gradient',
  'metallic',
  'crystal',
] as const;
export type FrameFinish = (typeof frameFinishes)[number];

export const frameSizes = ['small', 'medium', 'large'] as const;
export type FrameSize = (typeof frameSizes)[number];

export const frameFits = ['women', 'men', 'unisex', 'kids'] as const;
export type FrameFit = (typeof frameFits)[number];

export const frameFeatures = ['spring-hinges', 'nose-pads', 'lightweight', 'adjustable'] as const;
export type FrameFeature = (typeof frameFeatures)[number];

export const faceShapes = ['oval', 'round', 'square', 'heart', 'oblong', 'diamond'] as const;
export type FaceShape = (typeof faceShapes)[number];

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
export type ColourFamily = (typeof colourFamilies)[number];

export const listingSorts = ['recommended', 'newest', 'price-asc', 'price-desc', 'rating'] as const;
export type ListingSort = (typeof listingSorts)[number];

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

/** A frame "suits" a face shape when its affinity score is at least this. */
export const FACE_SHAPE_MATCH = 0.75;

export const reviewSorts = ['recent', 'helpful', 'rating-high', 'rating-low'] as const;
export type ReviewSort = (typeof reviewSorts)[number];

export const DEFAULT_PAGE_SIZE = 24;
export const MAX_PAGE_SIZE = 48;
export const MAX_PAGE = 100;
export const MAX_SEARCH_LENGTH = 80;

/** Filters that narrow the result set (everything except sort and paging). */
export const listingFilterKeys = [
  'category',
  'q',
  'shape',
  'material',
  'size',
  'colour',
  'fit',
  'feature',
  'faceShape',
  'collection',
  'minPrice',
  'maxPrice',
  'minRating',
  'inStock',
] as const;
