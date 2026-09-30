import { buildApp } from '../src/app';
import { loadApiEnv, type ApiEnv } from '../src/config/env';
import type { DependencyProbe } from '../src/infra/probes';

export const baseTestEnv = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://optical:optical@localhost:5432/optical_test',
  REDIS_URL: 'redis://localhost:6379',
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

export async function buildTestApp(
  options: { env?: Record<string, string>; database?: ProbeBehaviour; redis?: ProbeBehaviour } = {},
) {
  const database = fakeProbe('database', options.database);
  const redis = fakeProbe('redis', options.redis);
  const app = await buildApp(testEnv(options.env), { database, redis });
  return { app, database, redis };
}
