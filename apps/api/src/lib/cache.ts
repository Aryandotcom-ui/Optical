import type { FastifyBaseLogger } from 'fastify';
import type { Redis } from 'ioredis';

/**
 * Read-through cache for hot, read-mostly data (catalogue, lens options).
 * Keys live in namespaces with a version number; bumping the version
 * invalidates every key in the namespace at once, without scanning.
 */
export interface Cache {
  getOrSet<T>(
    namespace: string,
    key: string,
    ttlSeconds: number,
    load: () => Promise<T>,
  ): Promise<T>;
  invalidate(namespace: string): Promise<void>;
}

/** No caching: always loads. Used in tests and when caching is disabled. */
export const noopCache: Cache = {
  getOrSet: (_namespace, _key, _ttl, load) => load(),
  invalidate: () => Promise.resolve(),
};

/**
 * Redis-backed cache that fails open: if Redis is slow or down, it logs a
 * warning and serves from the loader, so the site keeps working.
 */
export class RedisCache implements Cache {
  constructor(
    private readonly redis: Redis,
    private readonly log: Pick<FastifyBaseLogger, 'warn'>,
    private readonly prefix = 'cache',
  ) {}

  private async version(namespace: string): Promise<string> {
    return (await this.redis.get(`${this.prefix}:${namespace}:version`)) ?? '0';
  }

  async getOrSet<T>(
    namespace: string,
    key: string,
    ttlSeconds: number,
    load: () => Promise<T>,
  ): Promise<T> {
    let fullKey: string | null = null;
    try {
      fullKey = `${this.prefix}:${namespace}:${await this.version(namespace)}:${key}`;
      const hit = await this.redis.get(fullKey);
      if (hit !== null) return JSON.parse(hit) as T;
    } catch (error) {
      this.log.warn({ err: error, namespace }, 'Cache read failed; loading from source');
      fullKey = null;
    }
    const value = await load();
    if (fullKey) {
      this.redis.set(fullKey, JSON.stringify(value), 'EX', ttlSeconds).catch((error: unknown) => {
        this.log.warn({ err: error, namespace }, 'Cache write failed');
      });
    }
    return value;
  }

  async invalidate(namespace: string): Promise<void> {
    try {
      await this.redis.incr(`${this.prefix}:${namespace}:version`);
    } catch (error) {
      this.log.warn({ err: error, namespace }, 'Cache invalidation failed; entries expire by TTL');
    }
  }
}
