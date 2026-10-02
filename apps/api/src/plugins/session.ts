import cookie from '@fastify/cookie';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { randomToken, sha256Hex } from '../lib/tokens';

export const SESSION_COOKIE = 'lo_session';
/** Guest sessions (and their carts) last 30 days from the last change. */
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

declare module 'fastify' {
  interface FastifyRequest {
    /**
     * The SHA-256 of this browser's guest session token, or null when it has
     * none yet. Carts and uploads are keyed by the hash; the token itself is
     * never stored.
     */
    sessionHash: string | null;
  }
  interface FastifyReply {
    /** Returns this browser's session hash, starting a session (setting the cookie) if needed. */
    ensureSession: () => string;
  }
}

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export interface SessionOptions {
  secure: boolean;
}

/**
 * Guest sessions: an opaque random token in an httpOnly, SameSite=Lax
 * cookie. No personal data lives in the cookie, and the server keeps only
 * its hash. The cookie is set lazily, the first time a request needs a
 * session (adding to the bag, uploading a prescription).
 */
export const sessionPlugin = fp(
  async (app: FastifyInstance, options: SessionOptions) => {
    await app.register(cookie);
    app.decorateRequest('sessionHash', null);
    app.decorateReply('ensureSession', function (this: FastifyReply) {
      const request: FastifyRequest = this.request;
      if (request.sessionHash) return request.sessionHash;
      const token = randomToken();
      void this.setCookie(SESSION_COOKIE, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: options.secure,
        path: '/',
        maxAge: SESSION_MAX_AGE_SECONDS,
      });
      request.sessionHash = sha256Hex(token);
      return request.sessionHash;
    });
    app.addHook('onRequest', (request, _reply, done) => {
      const token = request.cookies[SESSION_COOKIE];
      request.sessionHash = token && TOKEN_PATTERN.test(token) ? sha256Hex(token) : null;
      done();
    });
  },
  { name: 'session' },
);
