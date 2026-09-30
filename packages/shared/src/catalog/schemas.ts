import { z } from 'zod';
import {
  categorySlugSchema,
  colourFamilySchema,
  faceShapeSchema,
  frameFeatureSchema,
  frameFinishSchema,
  frameFitSchema,
  frameMaterialSchema,
  frameShapeSchema,
  frameSizeSchema,
  hingeTypeSchema,
  productTypeSchema,
  rimTypeSchema,
} from './enums';

const minor = z.number().int().nonnegative();

export const imageKinds = ['front', 'angle', 'side', 'on-face', 'detail'] as const;

export const productImageSchema = z
  .object({
    url: z.string(),
    alt: z.string(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    kind: z.enum(imageKinds),
  })
  .meta({ id: 'ProductImage' });
export type ProductImage = z.infer<typeof productImageSchema>;

export const stockStateSchema = z.enum(['in-stock', 'low-stock', 'out-of-stock']);

export const variantSummarySchema = z
  .object({
    id: z.string(),
    sku: z.string(),
    colourName: z.string(),
    colourFamily: colourFamilySchema,
    swatchHex: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    finish: frameFinishSchema,
    images: z.array(productImageSchema),
    stockState: stockStateSchema,
    /** Exact count only when stock is low (≤ 3); otherwise null, so the UI can't invent scarcity. */
    lowStockCount: z.number().int().nullable(),
  })
  .meta({ id: 'VariantSummary' });
export type VariantSummary = z.infer<typeof variantSummarySchema>;

export const ratingSummarySchema = z.object({
  average: z.number().min(0).max(5).nullable(),
  count: z.number().int().nonnegative(),
});

export const productSummarySchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    category: categorySlugSchema,
    productType: productTypeSchema,
    shape: frameShapeSchema.nullable(),
    material: frameMaterialSchema.nullable(),
    fit: frameFitSchema.nullable(),
    size: frameSizeSchema.nullable(),
    priceMinor: minor,
    rating: ratingSummarySchema,
    isNew: z.boolean(),
    defaultVariantId: z.string(),
    variants: z.array(variantSummarySchema).min(1),
  })
  .meta({ id: 'ProductSummary' });
export type ProductSummary = z.infer<typeof productSummarySchema>;

export const frameSpecSchema = z
  .object({
    shape: frameShapeSchema,
    lensWidthMm: z.number().positive(),
    bridgeMm: z.number().positive(),
    templeMm: z.number().positive(),
    lensHeightMm: z.number().positive(),
    totalWidthMm: z.number().positive(),
    weightG: z.number().positive(),
    material: frameMaterialSchema,
    rimType: rimTypeSchema,
    hinge: hingeTypeSchema,
    features: z.array(frameFeatureSchema),
    /** Optional hand-made model that replaces the procedural geometry. */
    glbUrl: z.string().nullable(),
  })
  .meta({ id: 'FrameSpec' });
export type FrameSpec = z.infer<typeof frameSpecSchema>;

export const productDetailSchema = productSummarySchema
  .extend({
    description: z.string(),
    materialsAndCare: z.string(),
    frame: frameSpecSchema.nullable(),
    faceShapes: z.array(z.object({ faceShape: faceShapeSchema, score: z.number().min(0).max(1) })),
    collections: z.array(z.object({ slug: z.string(), name: z.string() })),
    styleTags: z.array(z.string()),
    seo: z.object({ title: z.string(), description: z.string() }),
    /** Frames can be bought with prescription lenses; accessories and some sunglasses cannot. */
    lensesAvailable: z.boolean(),
  })
  .meta({ id: 'ProductDetail' });
export type ProductDetail = z.infer<typeof productDetailSchema>;

export const facetOptionSchema = z.object({
  value: z.string(),
  label: z.string().optional(),
  count: z.number().int().nonnegative(),
});
export type FacetOption = z.infer<typeof facetOptionSchema>;

export const listingFacetsSchema = z
  .object({
    category: z.array(facetOptionSchema),
    shape: z.array(facetOptionSchema),
    material: z.array(facetOptionSchema),
    size: z.array(facetOptionSchema),
    colour: z.array(facetOptionSchema),
    fit: z.array(facetOptionSchema),
    feature: z.array(facetOptionSchema),
    collection: z.array(facetOptionSchema),
    rating: z.array(facetOptionSchema),
    price: z.object({ minMinor: minor.nullable(), maxMinor: minor.nullable() }),
  })
  .meta({ id: 'ListingFacets' });
export type ListingFacets = z.infer<typeof listingFacetsSchema>;

export const productListingSchema = z
  .object({
    items: z.array(productSummarySchema),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    facets: listingFacetsSchema,
  })
  .meta({ id: 'ProductListing' });
export type ProductListing = z.infer<typeof productListingSchema>;

export const categorySchema = z
  .object({
    slug: categorySlugSchema,
    name: z.string(),
    description: z.string(),
    productCount: z.number().int().nonnegative(),
  })
  .meta({ id: 'Category' });
export type Category = z.infer<typeof categorySchema>;

export const collectionSchema = z
  .object({
    slug: z.string(),
    name: z.string(),
    tagline: z.string(),
    description: z.string(),
    products: z.array(productSummarySchema),
  })
  .meta({ id: 'Collection' });
export type Collection = z.infer<typeof collectionSchema>;

export const searchSuggestionSchema = z
  .object({
    query: z.string(),
    products: z.array(
      z.object({
        slug: z.string(),
        name: z.string(),
        category: categorySlugSchema,
        priceMinor: minor,
        image: productImageSchema.nullable(),
      }),
    ),
    categories: z.array(z.object({ slug: categorySlugSchema, name: z.string() })),
    collections: z.array(z.object({ slug: z.string(), name: z.string() })),
    /** Help-centre articles arrive in Phase 2; the field is stable from now on. */
    articles: z.array(z.object({ slug: z.string(), title: z.string() })),
  })
  .meta({ id: 'SearchSuggestions' });
export type SearchSuggestions = z.infer<typeof searchSuggestionSchema>;
