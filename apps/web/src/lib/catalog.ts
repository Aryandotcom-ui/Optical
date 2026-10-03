import 'server-only';
import {
  categorySchema,
  collectionSchema,
  collectionSummarySchema,
  helpArticleSchema,
  productDetailSchema,
  productListingSchema,
  productSummarySchema,
  reviewListSchema,
  toListingSearchParams,
  type ListingQuery,
  type ReviewSort,
} from '@optical/shared/catalog';
import type { FinderAnswers } from '@optical/shared/frame-finder';
import { finderResultsSchema } from '@optical/shared/frame-finder/schemas';
import { lensCatalogSchema } from '@optical/shared/lens';
import { z } from 'zod';
import { apiRequest, type ApiResult } from './api';

/** Thrown when the API can't be reached or answers unexpectedly; pages show their error boundary. */
export class CatalogUnavailableError extends Error {
  override name = 'CatalogUnavailableError';
}

/** Cache tag for every catalogue read; admin edits revalidate it (Phase 6). */
export const CATALOG_TAG = 'catalog';
const REVALIDATE_SECONDS = 60;

function unwrap<T>(result: ApiResult<T>, what: string): T {
  if (result.ok) return result.data;
  const detail = result.kind === 'error' ? result.error.code : result.kind;
  throw new CatalogUnavailableError(
    `Could not load ${what} (${detail}, request ${result.requestId}).`,
  );
}

/** Like `unwrap`, but a 404 becomes `null` so the page can call notFound(). */
function unwrapOrNull<T>(result: ApiResult<T>, what: string): T | null {
  if (!result.ok && result.kind === 'error' && result.status === 404) return null;
  return unwrap(result, what);
}

const cached = { revalidate: REVALIDATE_SECONDS, tags: [CATALOG_TAG] };

export async function getListing(query: Partial<ListingQuery>) {
  const params = toListingSearchParams(query).toString();
  return unwrap(
    await apiRequest(
      `/v1/products${params ? `?${params}` : ''}`,
      productListingSchema,
      query.q ? {} : cached,
    ),
    'products',
  );
}

export async function getProduct(slug: string) {
  return unwrapOrNull(
    await apiRequest(`/v1/products/${encodeURIComponent(slug)}`, productDetailSchema, cached),
    'the product',
  );
}

export async function getRelated(productId: string) {
  const result = await apiRequest(
    `/v1/products/${productId}/related`,
    z.object({ items: z.array(productSummarySchema) }),
    cached,
  );
  return unwrap(result, 'related products').items;
}

export async function getProductsByIds(ids: readonly string[]) {
  if (ids.length === 0) return [];
  const result = await apiRequest(
    `/v1/products/by-ids?ids=${ids.join(',')}`,
    z.object({ items: z.array(productSummarySchema) }),
    cached,
  );
  return unwrap(result, 'products').items;
}

export async function getReviews(productId: string, sort: ReviewSort = 'recent', page = 1) {
  return unwrap(
    await apiRequest(
      `/v1/products/${productId}/reviews?sort=${sort}&page=${page}`,
      reviewListSchema,
      cached,
    ),
    'reviews',
  );
}

export async function getCategories() {
  const result = await apiRequest(
    '/v1/categories',
    z.object({ items: z.array(categorySchema) }),
    cached,
  );
  return unwrap(result, 'categories').items;
}

export async function getCollection(slug: string) {
  return unwrapOrNull(
    await apiRequest(`/v1/collections/${encodeURIComponent(slug)}`, collectionSchema, cached),
    'the collection',
  );
}

export async function getCollections() {
  const result = await apiRequest(
    '/v1/collections',
    z.object({ items: z.array(collectionSummarySchema) }),
    cached,
  );
  return unwrap(result, 'collections').items;
}

export async function getLensOptions() {
  return unwrap(
    await apiRequest('/v1/lens/options', lensCatalogSchema, {
      revalidate: 300,
      tags: [CATALOG_TAG],
    }),
    'lens options',
  );
}

export async function getHelpArticles() {
  const result = await apiRequest(
    '/v1/help/articles',
    z.object({ items: z.array(helpArticleSchema) }),
    { revalidate: 300, tags: [CATALOG_TAG] },
  );
  return unwrap(result, 'help articles').items;
}

/**
 * Frame Finder results for a set of answers. Answers come from the URL,
 * so the same link always shows the same ranking; a failure is returned
 * (not thrown) so the page can show answers and a retry beside it.
 */
export async function getRecommendations(answers: FinderAnswers) {
  const result = await apiRequest('/v1/frame-finder/recommendations', finderResultsSchema, {
    init: {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(answers),
    },
    timeoutMs: 5_000,
  });
  return result.ok ? result.data : null;
}
