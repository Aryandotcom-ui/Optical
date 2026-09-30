import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { brand } from '@optical/config/brand';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { jsonSchemaTransform, jsonSchemaTransformObject } from 'fastify-type-provider-zod';

export interface OpenApiOptions {
  publicUrl: string;
  version: string;
  exposeUi: boolean;
}

/** Generates the OpenAPI document from route Zod schemas and serves it at /docs. */
export const openApiPlugin = fp(
  async (app: FastifyInstance, options: OpenApiOptions) => {
    await app.register(swagger, {
      openapi: {
        openapi: '3.1.0',
        info: {
          title: `${brand.name} API`,
          description:
            'Storefront and admin API. Every error uses the `ApiError` envelope; see docs/API.md for error codes.',
          version: options.version,
        },
        servers: [{ url: options.publicUrl }],
        tags: [{ name: 'system', description: 'Health and readiness probes' }],
      },
      transform: jsonSchemaTransform,
      transformObject: jsonSchemaTransformObject,
    });

    if (options.exposeUi) {
      await app.register(swaggerUi, {
        routePrefix: '/docs',
        staticCSP: true,
        // swagger-ui injects inline styles; allow them on the docs page only.
        transformStaticCSP: (header) =>
          header.replace("style-src 'self' https:", "style-src 'self' https: 'unsafe-inline'"),
        uiConfig: { docExpansion: 'list', deepLinking: true, tryItOutEnabled: true },
      });
    }
  },
  { name: 'openapi' },
);
