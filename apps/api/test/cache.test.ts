import { Redis } from 'ioredis';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { noopCache, RedisCache } from '../src/lib/cache';
import { TEST_REDIS_URL } from './helpers';

const redis = new Redis(TEST_REDIS_URL, { maxRetriesPerRequest: 1 });
const log = { warn: vi.fn() };
afterAll(() => {
  redis.disconnect();
});

describe('RedisCache', () => {
  const namespace = `test-${Date.now()}`;

  it('loads once and serves later reads from Redis', async () => {
    const cache = new RedisCache(redis, log);
    const load = vi.fn(() => Promise.resolve({ value: 42 }));
    expect(await cache.getOrSet(namespace, 'answer', 60, load)).toEqual({ value: 42 });
    await vi.waitFor(async () => {
      expect(await redis.keys(`cache:${namespace}:*`)).toHaveLength(1);
    });
    expect(await cache.getOrSet(namespace, 'answer', 60, load)).toEqual({ value: 42 });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('invalidates a whole namespace by bumping its version', async () => {
    const cache = new RedisCache(redis, log);
    await cache.getOrSet(namespace, 'k', 60, () => Promise.resolve('old'));
    await vi.waitFor(async () => {
      expect(await redis.get(`cache:${namespace}:0:k`)).toBe('"old"');
    });
    await cache.invalidate(namespace);
    expect(await cache.getOrSet(namespace, 'k', 60, () => Promise.resolve('new'))).toBe('new');
  });

  it('fails open when Redis is unavailable', async () => {
    const down = new Redis('redis://127.0.0.1:1', {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 0,
      retryStrategy: () => null,
    });
    down.on('error', () => undefined);
    const cache = new RedisCache(down, log);
    expect(await cache.getOrSet('x', 'y', 60, () => Promise.resolve('from source'))).toBe(
      'from source',
    );
    await cache.invalidate('x');
    expect(log.warn).toHaveBeenCalled();
    down.disconnect();
  });
});

describe('noopCache', () => {
  it('always calls the loader', async () => {
    const load = vi.fn(() => Promise.resolve(1));
    await noopCache.getOrSet('a', 'b', 1, load);
    await noopCache.getOrSet('a', 'b', 1, load);
    await noopCache.invalidate('a');
    expect(load).toHaveBeenCalledTimes(2);
  });
});
