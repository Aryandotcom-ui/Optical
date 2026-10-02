import { listingQuerySchema, listingFilterKeys, type ListingQuery } from '@optical/shared/catalog';
import { omitKeys } from './objects';

export type SearchParamsRecord = Record<string, string | string[] | undefined>;

/**
 * Parses URL search params into a listing query. Invalid parameters (an
 * old link with a retired shape, a typo) are dropped rather than failing
 * the page, and reported so the page can show what was ignored.
 */
export function parseListingParams(
  params: SearchParamsRecord,
  fixed: Partial<ListingQuery> = {},
): { query: ListingQuery; ignored: string[] } {
  let input: Record<string, unknown> = omitKeys(params, Object.keys(fixed));
  const ignored: string[] = [];
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const parsed = listingQuerySchema.safeParse({ ...input, ...fixed });
    if (parsed.success) return { query: parsed.data, ignored };
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '');
      if (key in input) {
        input = omitKeys(input, [key]);
        if (!ignored.includes(key)) ignored.push(key);
      } else {
        // A problem in a fixed value (should not happen): fall back to defaults.
        return { query: listingQuerySchema.parse(fixed), ignored };
      }
    }
  }
  return { query: listingQuerySchema.parse(fixed), ignored };
}

/** Active filter values as removable chips, excluding the fixed context (e.g. the category page's category). */
export function activeFilters(
  query: ListingQuery,
  fixed: Partial<ListingQuery> = {},
): { key: (typeof listingFilterKeys)[number]; value: string }[] {
  const chips: { key: (typeof listingFilterKeys)[number]; value: string }[] = [];
  for (const key of listingFilterKeys) {
    if (key in fixed || key === 'q') continue;
    const value = query[key];
    if (Array.isArray(value)) for (const entry of value) chips.push({ key, value: entry });
    else if (value !== undefined && value !== false) chips.push({ key, value: String(value) });
  }
  return chips;
}
