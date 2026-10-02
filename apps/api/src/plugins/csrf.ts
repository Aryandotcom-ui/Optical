import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { AppError } from '../lib/app-error';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export interface CsrfOptions {
  allowedOrigins: string[];
  /** Path prefixes that never carry cookies and authenticate otherwise (signed webhooks). */
  exemptPrefixes: string[];
}

/**
 * Cross-site request forgery protection for cookie-authenticated writes.
 * Three layers: the session cookie is SameSite=Lax; the API only parses
 * JSON and multipart bodies, so a plain HTML form can't send one it
 * accepts; and any state-changing request that carries cookies must come
 * from an allowed Origin (browsers always send Origin on such requests).
 */
export const csrfPlugin = fp(
  (app: FastifyInstance, options: CsrfOptions) => {
    const allowed = new Set(options.allowedOrigins);
    app.addHook('onRequest', (request, _reply, done) => {
      if (SAFE_METHODS.has(request.method)) {
        done();
        return;
      }
      if (options.exemptPrefixes.some((prefix) => request.url.startsWith(prefix))) {
        done();
        return;
      }
      if (!request.headers.cookie) {
        done();
        return;
      }
      const origin = request.headers.origin;
      if (origin && allowed.has(origin)) {
        done();
        return;
      }
      done(
        new AppError(
          'FORBIDDEN',
          'This request came from a page we do not recognise, so it was blocked. Reload the page and try again.',
        ),
      );
    });
    return Promise.resolve();
  },
  { name: 'csrf' },
);
