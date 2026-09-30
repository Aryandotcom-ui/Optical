import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * Migrates and seeds the test database once per test run, so integration
 * tests read the same deterministic catalogue as local development.
 * Uses TEST_DATABASE_URL (default: the optical_test database created by
 * docker-compose). Set TEST_SKIP_DB_SETUP=1 to reuse an already-seeded database.
 */
export default function setup() {
  if (process.env.TEST_SKIP_DB_SETUP === '1') return;
  const url =
    process.env.TEST_DATABASE_URL ?? 'postgresql://optical:optical@localhost:5432/optical_test';
  const cwd = fileURLToPath(new URL('..', import.meta.url));
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: url,
    SEED_DATABASE_URL: url,
    LOG_LEVEL: 'silent',
  };
  const run = (args: string[]) => {
    try {
      execFileSync('pnpm', ['exec', ...args], { cwd, env, stdio: 'pipe' });
    } catch (error) {
      const output = error as { stdout?: Buffer; stderr?: Buffer };
      throw new Error(
        `Test database setup failed (${args.join(' ')}). Is Postgres running? Try pnpm docker:up.\n${output.stderr?.toString() ?? ''}${output.stdout?.toString() ?? ''}`,
      );
    }
  };
  run(['prisma', 'migrate', 'deploy']);
  run(['tsx', 'prisma/seed/index.ts']);
}
