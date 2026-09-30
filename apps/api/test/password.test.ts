import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/lib/password';

describe('password hashing', () => {
  it('produces argon2id hashes with the configured cost', async () => {
    const stored = await hashPassword('correct horse battery');
    expect(stored).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  });

  it('salts every hash', async () => {
    expect(await hashPassword('same password')).not.toBe(await hashPassword('same password'));
  });

  it('verifies the right password and rejects others', async () => {
    const stored = await hashPassword('correct horse battery');
    expect(await verifyPassword(stored, 'correct horse battery')).toBe(true);
    expect(await verifyPassword(stored, 'Correct horse battery')).toBe(false);
  });

  it('returns false for malformed hashes instead of throwing', async () => {
    expect(await verifyPassword('not-a-hash', 'anything')).toBe(false);
  });
});
