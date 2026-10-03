import { hkdfSync } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';

/** Access tokens are short-lived: a stolen one is useful for minutes, not days. */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

const ISSUER = 'lumen-optics-api';
const AUDIENCE = 'lumen-optics-shop';

export type Role = 'CUSTOMER' | 'STAFF' | 'ADMIN';

export interface AccessClaims {
  userId: string;
  role: Role;
  /** The refresh-token family (one per sign-in); revoking it ends this session at once. */
  familyId: string;
}

const ROLES: readonly string[] = ['CUSTOMER', 'STAFF', 'ADMIN'];

/**
 * Signed (HS256) JWT access tokens. The key is derived from APP_SECRET with
 * HKDF, so it is never the same bytes as the secret used for order links or
 * file signatures.
 */
export class AccessTokens {
  private readonly key: Uint8Array;

  constructor(
    secret: string,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.key = new Uint8Array(hkdfSync('sha256', secret, 'lumen-optics', 'access-token-v1', 32));
  }

  sign(claims: AccessClaims): Promise<string> {
    const issuedAt = Math.floor(this.now().getTime() / 1000);
    return new SignJWT({ role: claims.role, fam: claims.familyId })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(claims.userId)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + ACCESS_TOKEN_TTL_SECONDS)
      .sign(this.key);
  }

  /** The claims of a valid, unexpired token; null for anything else. Never throws. */
  async verify(token: string): Promise<AccessClaims | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        algorithms: ['HS256'],
        issuer: ISSUER,
        audience: AUDIENCE,
        currentDate: this.now(),
      });
      const { sub, role, fam } = payload;
      if (typeof sub !== 'string' || typeof fam !== 'string') return null;
      if (typeof role !== 'string' || !ROLES.includes(role)) return null;
      return { userId: sub, role: role as Role, familyId: fam };
    } catch {
      return null;
    }
  }
}
