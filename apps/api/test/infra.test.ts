import { describe, expect, it } from 'vitest';
import { createDatabaseProbe } from '../src/infra/database';
import { createRedisProbe } from '../src/infra/redis';

/**
 * Integration tests against real services. Locally these are the Docker
 * Compose containers (`pnpm docker:up`); CI provides service containers.
 */
const databaseUrl =
  process.env.TEST_DATABASE_URL ?? 'postgresql://optical:optical@localhost:5432/optical_test';
const redisUrl = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379';
// Port 1 is reserved and never has a listener, so connections are refused fast.
const unreachablePostgres = 'postgresql://optical:optical@127.0.0.1:1/optical';
const unreachableRedis = 'redis://127.0.0.1:1';

describe('database probe', () => {
  it('pings a live Postgres and closes cleanly', async () => {
    const probe = createDatabaseProbe(databaseUrl);
    await expect(probe.ping()).resolves.toBeUndefined();
    await expect(probe.close()).resolves.toBeUndefined();
  });

  it('rejects when Postgres is unreachable', async () => {
    const probe = createDatabaseProbe(unreachablePostgres);
    await expect(probe.ping()).rejects.toThrow();
    await probe.close();
  });
});

describe('redis probe', () => {
  it('connects lazily, pings a live Redis and closes', async () => {
    const probe = createRedisProbe(redisUrl);
    expect(probe.client.status).toBe('wait');
    await expect(probe.ping()).resolves.toBeUndefined();
    expect(probe.client.status).toBe('ready');
    await probe.close();
    expect(probe.client.status).toBe('end');
  });

  it('rejects with a readable message when Redis is unreachable', async () => {
    const probe = createRedisProbe(unreachableRedis);
    await expect(probe.ping()).rejects.toThrow();
    await expect(probe.ping()).rejects.toThrow(/Not connected \((connecting|reconnecting)\)/);
    await probe.close();
  });
});
