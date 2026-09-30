import { hash, verify } from '@node-rs/argon2';

/**
 * Password hashing with argon2id, using the OWASP-recommended minimum:
 * 19 MiB of memory, 2 iterations, 1 degree of parallelism.
 */
// The library's default algorithm is Argon2id (asserted in test/password.test.ts).
const ARGON2_OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

/** Verifies a password against a stored hash. Never throws on a malformed hash; returns false. */
export async function verifyPassword(storedHash: string, password: string): Promise<boolean> {
  try {
    return await verify(storedHash, password);
  } catch {
    return false;
  }
}
