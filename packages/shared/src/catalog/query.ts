import { z } from 'zod';
import {
  categorySlugSchema,
  colourFamilySchema,
  frameFeatureSchema,
  frameFitSchema,
  frameMaterialSchema,
  frameShapeSchema,
  frameSizeSchema,
  listingSortSchema,
} from './enums';

export const DEFAULT_PAGE_SIZE = 24;
export const MAX_PAGE_SIZE = 48;
export const MAX_PAGE = 100;
export const MAX_SEARCH_LENGTH = 80;

/**
 * Accepts `?shape=round&shape=square`, `?shape=round,square` or a single
 * value, de-duplicates, and validates each entry. Unknown values fail rather
 * than being silently ignored, so bad links are caught early. Values are
 * sorted so equivalent filters always produce the same query.
 */
function multi<T extends z.ZodType<string>>(item: T) {
  return z
    .preprocess((value) => {
      if (value === undefined || value === '') return [];
      const raw = Array.isArray(value) ? value : [value];
      const parts = raw.flatMap((entry) => String(entry).split(',')).map((entry) => entry.trim());
      return [...new Set(parts.filter(Boolean))].sort();
    }, z.array(item).max(20))
    .default([]);
}

const optionalInt = (min: number, max: number) =>
  z.preprocess(
    (value) => (value === undefined || value === '' ? undefined : value),
    z.coerce.number().int().min(min).max(max).optional(),
  );

const flag = z.preprocess(
  (value) => (value === undefined || value === '' ? undefined : value),
  z
    .enum(['true', 'false', '1', '0'])
    .transform((value) => value === 'true' || value === '1')
    .optional(),
);

export const listingQuerySchema = z
  .object({
    category: categorySlugSchema.optional(),
    q: z.string().trim().max(MAX_SEARCH_LENGTH).optional(),
    shape: multi(frameShapeSchema),
    material: multi(frameMaterialSchema),
    size: multi(frameSizeSchema),
    colour: multi(colourFamilySchema),
    fit: multi(frameFitSchema),
    feature: multi(frameFeatureSchema),
    collection: multi(z.string().regex(/^[a-z0-9-]{1,64}$/)),
    minPrice: optionalInt(0, 10_000_000_00),
    maxPrice: optionalInt(0, 10_000_000_00),
    minRating: optionalInt(1, 5),
    inStock: flag,
    sort: listingSortSchema.default('recommended'),
    page: optionalInt(1, MAX_PAGE).transform((value) => value ?? 1),
    pageSize: optionalInt(1, MAX_PAGE_SIZE).transform((value) => value ?? DEFAULT_PAGE_SIZE),
  })
  .refine(
    (query) =>
      query.minPrice === undefined ||
      query.maxPrice === undefined ||
      query.minPrice <= query.maxPrice,
    { path: ['minPrice'], message: 'The minimum price must not be above the maximum.' },
  );

export type ListingQuery = z.output<typeof listingQuerySchema>;
export type ListingQueryInput = z.input<typeof listingQuerySchema>;

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
  'collection',
  'minPrice',
  'maxPrice',
  'minRating',
  'inStock',
] as const satisfies readonly (keyof ListingQuery)[];

/**
 * Serialises a query to canonical URL search params: stable key order,
 * sorted multi-values, defaults omitted. Equal filters always produce the
 * same URL, which keeps caches and shared links consistent.
 */
export function toListingSearchParams(query: Partial<ListingQuery>): URLSearchParams {
  const params = new URLSearchParams();
  const keys = [...listingFilterKeys, 'sort', 'page', 'pageSize'] as const;
  for (const key of keys) {
    const value = query[key];
    if (value === undefined || value === '' || value === false) continue;
    if (Array.isArray(value)) {
      if (value.length) params.set(key, [...value].sort().join(','));
      continue;
    }
    if (key === 'sort' && value === 'recommended') continue;
    if (key === 'page' && value === 1) continue;
    if (key === 'pageSize' && value === DEFAULT_PAGE_SIZE) continue;
    params.set(key, String(value));
  }
  return params;
}

/** Number of active filters, for the "Filters (3)" button and "Clear all". */
export function countActiveFilters(query: ListingQuery): number {
  let count = 0;
  for (const key of listingFilterKeys) {
    const value = query[key];
    if (Array.isArray(value)) count += value.length;
    else if (value !== undefined && value !== false && value !== '') count += 1;
  }
  return count;
}
