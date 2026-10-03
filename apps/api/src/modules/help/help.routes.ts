import { apiErrorSchema } from '@optical/shared/api';
import { helpArticleSchema } from '@optical/shared/catalog';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { HelpService } from './help.service';

const PUBLIC_CACHE = 'public, max-age=300, stale-while-revalidate=600';

export const helpRoutes: FastifyPluginAsyncZod<{ service: HelpService }> = (app, { service }) => {
  app.get(
    '/help/articles',
    {
      schema: {
        tags: ['help'],
        summary: 'Help centre articles',
        response: { 200: z.object({ items: z.array(helpArticleSchema) }) },
      },
    },
    async (_request, reply) => {
      void reply.header('cache-control', PUBLIC_CACHE);
      return { items: await service.articles() };
    },
  );

  app.get(
    '/help/articles/:slug',
    {
      schema: {
        tags: ['help'],
        summary: 'A help article',
        params: z.object({ slug: z.string().regex(/^[a-z0-9-]{1,80}$/) }),
        response: { 200: helpArticleSchema, 404: apiErrorSchema, 422: apiErrorSchema },
      },
    },
    (request, reply) => {
      void reply.header('cache-control', PUBLIC_CACHE);
      return service.article(request.params.slug);
    },
  );

  return Promise.resolve();
};
