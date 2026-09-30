import { apiErrorSchema } from '@optical/shared/api';
import {
  categorySchema,
  collectionSchema,
  listingQuerySchema,
  MAX_SEARCH_LENGTH,
  productDetailSchema,
  productListingSchema,
  productSummarySchema,
  searchSuggestionSchema,
} from '@optical/shared/catalog';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { CatalogController } from './catalog.controller';

const slugParam = z.object({
  slug: z.string().regex(/^[a-z0-9-]{1,80}$/, 'Use lowercase letters, numbers and hyphens.'),
});
const errors = { 404: apiErrorSchema, 422: apiErrorSchema };

export const catalogRoutes: FastifyPluginAsyncZod<{ controller: CatalogController }> = (
  app,
  { controller },
) => {
  app.get(
    '/products',
    {
      schema: {
        tags: ['catalogue'],
        summary: 'List products',
        description:
          'Filters (multi-select values may repeat or be comma-separated), sort and pagination. Facet counts are disjunctive: each facet ignores its own filter. Prices are minor units.',
        querystring: listingQuerySchema,
        response: { 200: productListingSchema, 422: apiErrorSchema },
      },
    },
    (request, reply) => controller.list(request.query, reply),
  );

  app.get(
    '/products/:slug',
    {
      schema: {
        tags: ['catalogue'],
        summary: 'Get a product',
        params: slugParam,
        response: { 200: productDetailSchema, ...errors },
      },
    },
    (request, reply) => controller.product(request.params.slug, reply),
  );

  app.get(
    '/products/:id/related',
    {
      schema: {
        tags: ['catalogue'],
        summary: 'Similar products',
        description:
          'Content-based: same category, then shared shape, material, style and price range.',
        params: z.object({ id: z.uuid() }),
        response: { 200: z.object({ items: z.array(productSummarySchema) }), ...errors },
      },
    },
    (request, reply) => controller.related(request.params.id, reply),
  );

  app.get(
    '/categories',
    {
      schema: {
        tags: ['catalogue'],
        summary: 'List categories',
        response: { 200: z.object({ items: z.array(categorySchema) }) },
      },
    },
    (_request, reply) => controller.categories(reply),
  );

  app.get(
    '/collections/:slug',
    {
      schema: {
        tags: ['catalogue'],
        summary: 'Get a collection',
        params: slugParam,
        response: { 200: collectionSchema, ...errors },
      },
    },
    (request, reply) => controller.collection(request.params.slug, reply),
  );

  app.get(
    '/search/suggest',
    {
      schema: {
        tags: ['search'],
        summary: 'Instant search suggestions',
        description:
          'Typo-tolerant product, category, collection and help-article suggestions for the search palette.',
        querystring: z.object({ q: z.string().max(MAX_SEARCH_LENGTH).default('') }),
        response: { 200: searchSuggestionSchema, 422: apiErrorSchema },
      },
    },
    (request, reply) => controller.suggest(request.query.q, reply),
  );

  return Promise.resolve();
};
