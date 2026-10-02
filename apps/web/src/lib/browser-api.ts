import type { ProductDetail, ProductSummary, SearchSuggestions } from '@optical/shared/catalog';

/**
 * Browser calls to the public API. Responses come from our own API, whose
 * contracts are validated server-side, so they are typed rather than
 * re-validated here (keeps Zod out of the client bundle).
 */
const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/+$/, '');

export class BrowserApiError extends Error {
  override name = 'BrowserApiError';
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    signal,
    headers: { accept: 'application/json' },
    credentials: 'include',
  });
  if (!response.ok)
    throw new BrowserApiError(response.status, `Request to ${path} failed with ${response.status}`);
  return (await response.json()) as T;
}

export function fetchSuggestions(query: string, signal?: AbortSignal) {
  return getJson<SearchSuggestions>(`/v1/search/suggest?q=${encodeURIComponent(query)}`, signal);
}

/** The API takes up to 48 ids per request, so longer lists are fetched in batches. */
const BY_IDS_LIMIT = 48;

export async function fetchProductsByIds(
  ids: readonly string[],
  signal?: AbortSignal,
): Promise<ProductSummary[]> {
  const batches: string[][] = [];
  for (let start = 0; start < ids.length; start += BY_IDS_LIMIT)
    batches.push(ids.slice(start, start + BY_IDS_LIMIT));
  const results = await Promise.all(
    batches.map(
      async (batch) =>
        (
          await getJson<{ items: ProductSummary[] }>(
            `/v1/products/by-ids?ids=${batch.join(',')}`,
            signal,
          )
        ).items,
    ),
  );
  return results.flat();
}

/** One product's full details, or null if it no longer exists. */
export async function fetchProduct(
  slug: string,
  signal?: AbortSignal,
): Promise<ProductDetail | null> {
  try {
    return await getJson<ProductDetail>(`/v1/products/${encodeURIComponent(slug)}`, signal);
  } catch (error) {
    if (error instanceof BrowserApiError && error.status === 404) return null;
    throw error;
  }
}
