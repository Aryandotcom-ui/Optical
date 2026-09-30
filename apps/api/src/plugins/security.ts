import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { REQUEST_ID_HEADER } from '../lib/request-id';

export interface SecurityOptions {
  allowedOrigins: string[];
}

/**
 * Security headers and CORS. The API only serves JSON, so its CSP forbids
 * everything; the docs UI sets its own, looser policy for its static assets.
 */
export const securityPlugin = fp(
  async (app: FastifyInstance, options: SecurityOptions) => {
    await app.register(helmet, {
      global: true,
      contentSecurityPolicy: {
        useDefaults: false,
        directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
    });

    const allowed = new Set(options.allowedOrigins);
    await app.register(cors, {
      origin: (origin, callback) => {
        // Same-origin and server-to-server requests have no Origin header.
        callback(null, origin === undefined || allowed.has(origin));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
      exposedHeaders: [REQUEST_ID_HEADER],
      maxAge: 600,
    });
  },
  { name: 'security' },
);
