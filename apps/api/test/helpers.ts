import { buildApp } from '../src/app';
import { loadApiEnv, type ApiEnv } from '../src/config/env';
import { createPrismaClient, type Db } from '../src/infra/prisma';
import type { DependencyProbe } from '../src/infra/probes';

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://optical:optical@localhost:5432/optical_test';
export const TEST_REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379';

export const baseTestEnv = {
  NODE_ENV: 'test',
  DATABASE_URL: TEST_DATABASE_URL,
  REDIS_URL: TEST_REDIS_URL,
  LOG_LEVEL: 'silent',
  CORS_ALLOWED_ORIGINS: 'http://localhost:3000',
};

export function testEnv(overrides: Record<string, string> = {}): ApiEnv {
  return loadApiEnv({ ...baseTestEnv, ...overrides });
}

export type ProbeBehaviour = 'up' | 'down' | 'hang';

export function fakeProbe(name: string, behaviour: ProbeBehaviour = 'up') {
  const probe = {
    name,
    behaviour,
    closed: false,
    ping(): Promise<void> {
      if (probe.behaviour === 'down')
        return Promise.reject(new Error(`${name} refused the connection`));
      if (probe.behaviour === 'hang') return new Promise<void>(() => undefined);
      return Promise.resolve();
    },
    close(): Promise<void> {
      probe.closed = true;
      return Promise.resolve();
    },
  } satisfies DependencyProbe & Record<string, unknown>;
  return probe;
}

/** A Prisma client that throws if used, for tests that must not touch the database. */
const unusedDb = new Proxy(
  {},
  {
    get() {
      throw new Error('This test app has no database. Use buildDbTestApp().');
    },
  },
) as Db;

/** App with fake probes and no database: for HTTP-contract tests. */
export async function buildTestApp(
  options: { env?: Record<string, string>; database?: ProbeBehaviour; redis?: ProbeBehaviour } = {},
) {
  const database = fakeProbe('database', options.database);
  const redis = fakeProbe('redis', options.redis);
  const app = await buildApp(testEnv(options.env), { db: unusedDb, database, redis });
  return { app, database, redis };
}

/**
 * App backed by the seeded test database (see test/global-setup.ts).
 * Caching is off so each test sees the database directly.
 */
export async function buildDbTestApp() {
  const db = createPrismaClient(TEST_DATABASE_URL, { maxConnections: 4 });
  const app = await buildApp(testEnv(), {
    db,
    database: fakeProbe('database'),
    redis: fakeProbe('redis'),
  });
  app.addHook('onClose', async () => {
    await db.$disconnect();
  });
  return { app, db };
}
