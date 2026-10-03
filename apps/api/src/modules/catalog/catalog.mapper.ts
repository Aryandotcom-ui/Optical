import {
  FACE_SHAPE_MATCH,
  frameSizeForWidth,
  stockStateFor,
  type CategorySlug,
  type ColourFamily,
  type FaceShape,
  type FrameFeature,
  type FrameFinish,
  type FrameFit,
  type FrameMaterial,
  type FrameShape,
  type HingeType,
  type ProductDetail,
  type ProductImage,
  type ProductSummary,
  type ProductType,
  type RimType,
} from '@optical/shared/catalog';
import type { CatalogIndexEntry } from './listing';
import type { CatalogRepository, ProductDetailRow, ProductSummaryRow } from './catalog.repository';

/** Products launched within this many days carry the "new" label. */
export const NEW_PRODUCT_DAYS = 45;

type IndexRow = Awaited<ReturnType<CatalogRepository['indexRows']>>[number];

const available = (stock: { onHand: number; reserved: number } | null) =>
  Math.max(0, (stock?.onHand ?? 0) - (stock?.reserved ?? 0));

function effectivePrice(
  basePriceMinor: number,
  variants: readonly { priceOverrideMinor: number | null }[],
): number {
  const prices = variants.map((variant) => variant.priceOverrideMinor ?? basePriceMinor);
  return prices.length ? Math.min(...prices) : basePriceMinor;
}

export function toIndexEntry(row: IndexRow): CatalogIndexEntry {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category.slug as CategorySlug,
    shape: row.frame?.shape ?? null,
    material: row.frame?.material ?? null,
    size: row.frame ? frameSizeForWidth(row.frame.totalWidthMm) : null,
    fit: row.fit,
    features: (row.frame?.features ?? []) as FrameFeature[],
    faceShapes: row.faceShapes
      .filter((affinity) => affinity.score >= FACE_SHAPE_MATCH)
      .map((affinity) => affinity.faceShape),
    faceShapeScores: row.faceShapes.map((affinity) => ({
      faceShape: affinity.faceShape,
      score: affinity.score,
    })),
    totalWidthMm: row.frame?.totalWidthMm ?? null,
    colourFamilies: [...new Set(row.variants.map((variant) => variant.colourFamily))],
    collections: row.collections.map(({ collection }) => collection.slug),
    priceMinor: effectivePrice(row.basePriceMinor, row.variants),
    ratingAverage: row.ratingAverage,
    ratingCount: row.ratingCount,
    popularity: row.popularity,
    launchedAt: row.launchedAt.getTime(),
    inStock: row.variants.some((variant) => available(variant.stock) > 0),
    styleTags: row.styleTags,
  };
}

function toImage(image: ProductSummaryRow['variants'][number]['images'][number]): ProductImage {
  return {
    url: image.url,
    alt: image.alt,
    width: image.width,
    height: image.height,
    kind: image.kind as ProductImage['kind'],
  };
}

export function toSummary(row: ProductSummaryRow, now: Date): ProductSummary {
  const variants = row.variants.map((variant) => {
    const units = available(variant.stock);
    const state = stockStateFor(units);
    return {
      id: variant.id,
      sku: variant.sku,
      colourName: variant.colourName,
      colourFamily: variant.colourFamily as ColourFamily,
      swatchHex: variant.swatchHex,
      finish: variant.finish as FrameFinish,
      images: variant.images.map(toImage),
      stockState: state,
      // An exact count only when it is genuinely low, so the UI can never invent scarcity.
      lowStockCount: state === 'low-stock' ? units : null,
    };
  });
  const defaultVariant = row.variants.find((variant) => variant.isDefault) ?? row.variants[0];
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category.slug as CategorySlug,
    productType: row.type as ProductType,
    shape: (row.frame?.shape ?? null) as FrameShape | null,
    material: (row.frame?.material ?? null) as FrameMaterial | null,
    fit: row.fit as FrameFit | null,
    size: row.frame ? frameSizeForWidth(row.frame.totalWidthMm) : null,
    priceMinor: effectivePrice(row.basePriceMinor, row.variants),
    rating: { average: row.ratingAverage, count: row.ratingCount },
    isNew: now.getTime() - row.launchedAt.getTime() < NEW_PRODUCT_DAYS * 86_400_000,
    defaultVariantId: defaultVariant?.id ?? '',
    variants,
  };
}

export function toDetail(row: ProductDetailRow, now: Date): ProductDetail {
  const frame = row.frame;
  const summary = toSummary(row, now);
  return {
    ...summary,
    variants: summary.variants.map((variant, index) => {
      const source = row.variants[index];
      return {
        ...variant,
        priceMinor: source?.priceOverrideMinor ?? row.basePriceMinor,
        secondaryHex: source?.secondaryHex ?? null,
        hardwareHex: source?.hardwareHex ?? null,
        lensTintHex: source?.lensTintHex ?? null,
      };
    }),
    description: row.description,
    materialsAndCare: row.materialsAndCare,
    frame: frame
      ? {
          shape: frame.shape as FrameShape,
          lensWidthMm: frame.lensWidthMm,
          bridgeMm: frame.bridgeMm,
          templeMm: frame.templeMm,
          lensHeightMm: frame.lensHeightMm,
          totalWidthMm: frame.totalWidthMm,
          weightG: frame.weightG,
          material: frame.material as FrameMaterial,
          rimType: frame.rimType as RimType,
          hinge: frame.hinge as HingeType,
          features: frame.features as FrameFeature[],
          nosePads: frame.nosePads,
          glbUrl: frame.glbUrl,
        }
      : null,
    faceShapes: row.faceShapes.map((affinity) => ({
      faceShape: affinity.faceShape as FaceShape,
      score: affinity.score,
    })),
    collections: row.collections.map(({ collection }) => collection),
    styleTags: row.styleTags,
    seo: {
      title: row.seoTitle ?? row.name,
      description: row.seoDescription ?? row.description.slice(0, 160),
    },
    lensesAvailable: row.lensesAvailable,
  };
}
