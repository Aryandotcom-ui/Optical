import type { Metadata } from 'next';
import type { SearchParamsRecord } from './listing-params';

/** Params that only change presentation; they don't create a different page for search engines. */
const NEUTRAL_PARAMS = new Set(['sort', 'page', 'pageSize']);

/**
 * Canonical URL for a listing, plus noindex on filtered variants so search
 * engines index one clean page per category or collection.
 */
export function listingRobots(
  path: string,
  params: SearchParamsRecord,
): Pick<Metadata, 'alternates' | 'robots'> {
  const filtered = Object.keys(params).some(
    (key) => !NEUTRAL_PARAMS.has(key) && params[key] !== undefined && params[key] !== '',
  );
  return {
    alternates: { canonical: path },
    ...(filtered ? { robots: { index: false, follow: true } } : {}),
  };
}
