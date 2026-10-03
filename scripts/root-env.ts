import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** The monorepo root. */
export const repoRoot = fileURLToPath(new URL('..', import.meta.url));

/** Loads the root .env (variables already set in the environment win). */
export function loadRootEnv(): void {
  const file = `${repoRoot}.env`;
  if (existsSync(file)) process.loadEnvFile(file);
}
