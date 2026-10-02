import { DEFAULT_PAGE_SIZE, listingFilterKeys } from './constants';
import type { ListingQuery } from './query';

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

/**
 * The canonical query string for a listing URL. Commas are legal in a query
 * string, so they stay readable: `shape=round,square`, not `round%2Csquare`.
 */
export function toListingQueryString(query: Partial<ListingQuery>): string {
  return toListingSearchParams(query).toString().replaceAll('%2C', ',');
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
