import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { AppError } from '../lib/app-error';
import type { AccessClaims, AccessTokens } from '../modules/auth/access-token';
import { REFRESH_TOKEN_TTL_SECONDS, type RefreshTokens } from '../modules/auth/refresh-tokens';

export const ACCESS_COOKIE = 'lo_access';
export const REFRESH_COOKIE = 'lo_refresh';
/** Readable by the shop's scripts, so it can show "Account" without a request. Holds no secret. */
export const SIGNED_IN_COOKIE = 'lo_auth';
/** The refresh token is only ever sent to the auth endpoints. */
export const REFRESH_COOKIE_PATH = '/v1/auth';

/** Whose bag, uploads and orders a request may touch. */
export interface Owner {
  userId: string | null;
  sessionHash: string | null;
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Claims of a validly signed, unexpired access token (not yet checked for revocation). */
    accessClaims: AccessClaims | null;
    /** An access cookie was sent but has expired, is invalid, or its session was revoked. */
    authStale: boolean;
    authCheck: Promise<AccessClaims | null> | null;
    /** The signed-in customer, after checking the session is still live; null for guests. */
    signedInUser: () => Promise<AccessClaims | null>;
    /** The signed-in customer, or UNAUTHENTICATED. */
    requireUser: () => Promise<AccessClaims>;
    /**
     * The bag/uploads owner. Throws UNAUTHENTICATED when the access token is
     * stale, so the shop refreshes it instead of silently showing the guest bag.
     */
    owner: () => Promise<Owner>;
  }
  interface FastifyReply {
    /** Like `owner()`, starting a guest session for a guest if needed. */
    ensureOwner: () => Promise<Owner>;
    setAuthCookies: (tokens: { access: string; refresh?: string }) => void;
    clearAuthCookies: () => void;
  }
}

export interface AuthOptions {
  tokens: AccessTokens;
  refreshTokens: RefreshTokens;
  secure: boolean;
  /** Domain for the readable signed-in hint, when shop and API are on sibling subdomains. */
  hintDomain?: string | undefined;
}

const STALE_MESSAGE = 'Your sign-in has expired. Sign in again to continue.';

/**
 * Customer sign-in on top of guest sessions. Both auth cookies are
 * httpOnly and SameSite=Strict; the refresh token's cookie is scoped to
 * /v1/auth. The access cookie outlives the token inside it, so an expired
 * token is reported (401) rather than dropped by the browser, and the shop
 * refreshes and retries.
 */
export const authPlugin = fp(
  (app: FastifyInstance, options: AuthOptions) => {
    const base = { httpOnly: true, sameSite: 'strict', secure: options.secure } as const;
    const maxAge = REFRESH_TOKEN_TTL_SECONDS;

    app.decorateRequest('accessClaims', null);
    app.decorateRequest('authStale', false);
    app.decorateRequest('authCheck', null);

    app.decorateRequest('signedInUser', function (this: FastifyRequest) {
      if (!this.authCheck) {
        const claims = this.accessClaims;
        this.authCheck = claims
          ? options.refreshTokens.isLive(claims.familyId, claims.userId).then((live) => {
              if (live) return claims;
              this.authStale = true;
              return null;
            })
          : Promise.resolve(null);
      }
      return this.authCheck;
    });

    app.decorateRequest('requireUser', async function (this: FastifyRequest) {
      const user = await this.signedInUser();
      if (user) return user;
      throw new AppError(
        'UNAUTHENTICATED',
        this.authStale ? STALE_MESSAGE : 'Sign in to continue.',
      );
    });

    app.decorateRequest('owner', async function (this: FastifyRequest) {
      const user = await this.signedInUser();
      if (this.authStale) throw new AppError('UNAUTHENTICATED', STALE_MESSAGE);
      return { userId: user?.userId ?? null, sessionHash: this.sessionHash };
    });

    app.decorateReply('ensureOwner', async function (this: FastifyReply) {
      const owner = await this.request.owner();
      if (owner.userId) return owner;
      return { userId: null, sessionHash: this.ensureSession() };
    });

    app.decorateReply(
      'setAuthCookies',
      function (this: FastifyReply, tokens: { access: string; refresh?: string }) {
        void this.setCookie(ACCESS_COOKIE, tokens.access, { ...base, path: '/', maxAge });
        if (tokens.refresh)
          void this.setCookie(REFRESH_COOKIE, tokens.refresh, {
            ...base,
            path: REFRESH_COOKIE_PATH,
            maxAge,
          });
        void this.setCookie(SIGNED_IN_COOKIE, '1', {
          httpOnly: false,
          sameSite: 'lax',
          secure: options.secure,
          path: '/',
          maxAge,
          ...(options.hintDomain ? { domain: options.hintDomain } : {}),
        });
      },
    );

    app.decorateReply('clearAuthCookies', function (this: FastifyReply) {
      void this.clearCookie(ACCESS_COOKIE, { ...base, path: '/' });
      void this.clearCookie(REFRESH_COOKIE, { ...base, path: REFRESH_COOKIE_PATH });
      void this.clearCookie(SIGNED_IN_COOKIE, {
        path: '/',
        ...(options.hintDomain ? { domain: options.hintDomain } : {}),
      });
    });

    app.addHook('onRequest', async (request) => {
      const token = request.cookies[ACCESS_COOKIE];
      if (!token) return;
      request.accessClaims = await options.tokens.verify(token);
      if (!request.accessClaims) request.authStale = true;
    });
    return Promise.resolve();
  },
  { name: 'auth', dependencies: ['session'] },
);
