import type {
  CategorySlug,
  FacetOption,
  FrameFeature,
  ListingFacets,
  ListingQuery,
} from '@optical/shared/catalog';

/**
 * One published product's filterable attributes. The whole catalogue's
 * entries are small enough to filter, facet and sort in memory; search
 * relevance comes from Postgres (see catalog.repository.ts).
 */
export interface CatalogIndexEntry {
  id: string;
  slug: string;
  name: string;
  category: CategorySlug;
  shape: string | null;
  material: string | null;
  size: string | null;
  fit: string | null;
  features: FrameFeature[];
  /** Face shapes this frame suits (affinity at or above FACE_SHAPE_MATCH). */
  faceShapes: string[];
  colourFamilies: string[];
  collections: string[];
  priceMinor: number;
  ratingAverage: number | null;
  ratingCount: number;
  popularity: number;
  launchedAt: number;
  inStock: boolean;
  styleTags: string[];
}

export interface CatalogIndex {
  entries: CatalogIndexEntry[];
  collectionNames: Record<string, string>;
}

type FacetKey =
  | 'category'
  | 'shape'
  | 'material'
  | 'size'
  | 'colour'
  | 'fit'
  | 'feature'
  | 'faceShape'
  | 'collection'
  | 'rating'
  | 'price';

/** Values of an entry for a facet (multi-valued facets return several). */
function valuesFor(
  entry: CatalogIndexEntry,
  facet: Exclude<FacetKey, 'rating' | 'price'>,
): string[] {
  switch (facet) {
    case 'category':
      return [entry.category];
    case 'shape':
      return entry.shape ? [entry.shape] : [];
    case 'material':
      return entry.material ? [entry.material] : [];
    case 'size':
      return entry.size ? [entry.size] : [];
    case 'fit':
      return entry.fit ? [entry.fit] : [];
    case 'colour':
      return entry.colourFamilies;
    case 'feature':
      return entry.features;
    case 'faceShape':
      return entry.faceShapes;
    case 'collection':
      return entry.collections;
  }
}

/**
 * Does the entry pass every filter, ignoring `except`? Within a facet,
 * selected values are OR-ed (round or square); across facets, AND-ed —
 * except features, where every selected feature must be present.
 */
function matches(entry: CatalogIndexEntry, query: ListingQuery, except?: FacetKey): boolean {
  if (except !== 'category' && query.category && entry.category !== query.category) return false;
  const anyOf = (
    facet: Exclude<FacetKey, 'rating' | 'price' | 'category'>,
    selected: readonly string[],
  ) =>
    except === facet ||
    selected.length === 0 ||
    valuesFor(entry, facet).some((value) => selected.includes(value));
  if (!anyOf('shape', query.shape)) return false;
  if (!anyOf('material', query.material)) return false;
  if (!anyOf('size', query.size)) return false;
  if (!anyOf('colour', query.colour)) return false;
  if (!anyOf('fit', query.fit)) return false;
  if (!anyOf('collection', query.collection)) return false;
  if (!anyOf('faceShape', query.faceShape)) return false;
  if (except !== 'feature' && !query.feature.every((feature) => entry.features.includes(feature)))
    return false;
  if (except !== 'price') {
    if (query.minPrice !== undefined && entry.priceMinor < query.minPrice) return false;
    if (query.maxPrice !== undefined && entry.priceMinor > query.maxPrice) return false;
  }
  if (
    except !== 'rating' &&
    query.minRating !== undefined &&
    (entry.ratingAverage ?? 0) < query.minRating
  )
    return false;
  if (query.inStock && !entry.inStock) return false;
  return true;
}

function countValues(
  entries: CatalogIndexEntry[],
  facet: Exclude<FacetKey, 'rating' | 'price'>,
  labels?: Record<string, string>,
): FacetOption[] {
  const counts = new Map<string, number>();
  for (const entry of entries)
    for (const value of new Set(valuesFor(entry, facet)))
      counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .map(([value, count]) => ({
      value,
      count,
      ...(labels?.[value] ? { label: labels[value] } : {}),
    }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

/**
 * Facet counts are disjunctive: each facet counts products matching every
 * *other* active filter, so choosing "round" still shows how many "square"
 * frames you would get by adding it.
 */
export function computeFacets(
  index: CatalogIndex,
  candidates: CatalogIndexEntry[],
  query: ListingQuery,
): ListingFacets {
  const pool = (except: FacetKey) => candidates.filter((entry) => matches(entry, query, except));
  const priced = pool('price').map((entry) => entry.priceMinor);
  const rated = pool('rating');
  return {
    category: countValues(pool('category'), 'category'),
    shape: countValues(pool('shape'), 'shape'),
    material: countValues(pool('material'), 'material'),
    size: countValues(pool('size'), 'size'),
    colour: countValues(pool('colour'), 'colour'),
    fit: countValues(pool('fit'), 'fit'),
    feature: countValues(pool('feature'), 'feature'),
    faceShape: countValues(pool('faceShape'), 'faceShape'),
    collection: countValues(pool('collection'), 'collection', index.collectionNames),
    rating: [4, 3]
      .map((min) => ({
        value: String(min),
        count: rated.filter((entry) => (entry.ratingAverage ?? 0) >= min).length,
      }))
      .filter((option) => option.count > 0),
    price: {
      minMinor: priced.length ? Math.min(...priced) : null,
      maxMinor: priced.length ? Math.max(...priced) : null,
    },
  };
}

/** Sorts entries; `relevance` (search rank by id) drives "recommended" when searching. */
export function sortEntries(
  entries: CatalogIndexEntry[],
  sort: ListingQuery['sort'],
  relevance?: Map<string, number>,
): CatalogIndexEntry[] {
  const byName = (a: CatalogIndexEntry, b: CatalogIndexEntry) => a.name.localeCompare(b.name);
  const sorted = [...entries];
  switch (sort) {
    case 'recommended':
      return sorted.sort((a, b) =>
        relevance
          ? (relevance.get(b.id) ?? 0) - (relevance.get(a.id) ?? 0) ||
            b.popularity - a.popularity ||
            byName(a, b)
          : Number(b.inStock) - Number(a.inStock) || b.popularity - a.popularity || byName(a, b),
      );
    case 'newest':
      return sorted.sort((a, b) => b.launchedAt - a.launchedAt || byName(a, b));
    case 'price-asc':
      return sorted.sort((a, b) => a.priceMinor - b.priceMinor || byName(a, b));
    case 'price-desc':
      return sorted.sort((a, b) => b.priceMinor - a.priceMinor || byName(a, b));
    case 'rating':
      return sorted.sort(
        (a, b) =>
          (b.ratingAverage ?? 0) - (a.ratingAverage ?? 0) ||
          b.ratingCount - a.ratingCount ||
          byName(a, b),
      );
  }
}

export interface ListingPage {
  ids: string[];
  total: number;
  facets: ListingFacets;
}

/** Filters, facets, sorts and paginates. `searchRanks` limits candidates to search hits when present. */
export function runListing(
  index: CatalogIndex,
  query: ListingQuery,
  searchRanks?: Map<string, number>,
): ListingPage {
  const candidates = searchRanks
    ? index.entries.filter((entry) => searchRanks.has(entry.id))
    : index.entries;
  const filtered = candidates.filter((entry) => matches(entry, query));
  const sorted = sortEntries(filtered, query.sort, searchRanks);
  const start = (query.page - 1) * query.pageSize;
  return {
    ids: sorted.slice(start, start + query.pageSize).map((entry) => entry.id),
    total: filtered.length,
    facets: computeFacets(index, candidates, query),
  };
}

/**
 * "You may also like": content-based similarity on shared attributes.
 * Same category is required; shape, material, style tags, fit and price
 * proximity add to the score.
 */
export function relatedEntries(
  index: CatalogIndex,
  productId: string,
  limit = 8,
): CatalogIndexEntry[] {
  const source = index.entries.find((entry) => entry.id === productId);
  if (!source) return [];
  const scored = index.entries
    .filter((entry) => entry.id !== source.id && entry.category === source.category)
    .map((entry) => {
      let score = 0;
      if (entry.shape && entry.shape === source.shape) score += 3;
      if (entry.material && entry.material === source.material) score += 2;
      if (entry.fit && entry.fit === source.fit) score += 1;
      score += entry.styleTags.filter((tag) => source.styleTags.includes(tag)).length;
      score +=
        1 -
        Math.min(
          1,
          Math.abs(entry.priceMinor - source.priceMinor) / Math.max(source.priceMinor, 1),
        );
      if (entry.inStock) score += 0.5;
      return { entry, score };
    });
  return scored
    .sort((a, b) => b.score - a.score || b.entry.popularity - a.entry.popularity)
    .slice(0, limit)
    .map(({ entry }) => entry);
}
