import { apiErrorSchema } from '@optical/shared/api';
import {
  lensCatalogSchema,
  lensQuoteRequestSchema,
  lensQuoteResponseSchema,
} from '@optical/shared/lens';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { LensController } from './lens.controller';

export const lensRoutes: FastifyPluginAsyncZod<{ controller: LensController }> = (
  app,
  { controller },
) => {
  app.get(
    '/lens/options',
    {
      schema: {
        tags: ['lenses'],
        summary: 'Lens catalogue',
        description:
          'Lens types, materials (index), coatings, packages, tints and compatibility rules, with prices in minor units.',
        response: { 200: lensCatalogSchema },
      },
    },
    (_request, reply) => controller.options(reply),
  );

  app.post(
    '/lens/quote',
    {
      schema: {
        tags: ['lenses'],
        summary: 'Price a lens configuration',
        description:
          'Validates the configuration against the frame and the compatibility rules, returns itemised prices, an index recommendation, thickness estimates and option availability. An incomplete configuration returns `valid: false` with reasons.',
        body: lensQuoteRequestSchema,
        response: { 200: lensQuoteResponseSchema, 404: apiErrorSchema, 422: apiErrorSchema },
      },
    },
    (request, reply) => controller.quote(request.body, reply),
  );

  return Promise.resolve();
};
