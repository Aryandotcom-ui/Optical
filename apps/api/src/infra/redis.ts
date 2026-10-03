import { Redis } from 'ioredis';
import type { DependencyProbe } from './probes';

/**
 * Shared Redis connection. Commands fail fast while Redis is down instead of
 * queueing, so callers (rate limiting, caches) can degrade gracefully.
 */
export function createRedisProbe(url: string): DependencyProbe & { client: Redis } {
  const client = new Redis(url, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 2_000,
    retryStrategy: (attempt) => Math.min(attempt * 200, 5_000),
  });
  // Connection errors surface through readiness; don't crash on the event.
  client.on('error', () => undefined);

  return {
    name: 'redis',
    client,
    async ping() {
      if (client.status === 'wait') await client.connect();
      if (client.status !== 'ready') throw new Error(`Not connected (${client.status})`);
      await client.ping();
    },
    /** Sends QUIT when connected so pending replies drain; otherwise stops reconnecting. */
    async close() {
      if (client.status === 'ready') {
        const ended = new Promise<void>((resolve) =>
          client.once('end', () => {
            resolve();
          }),
        );
        await client.quit();
        await ended;
      } else {
        client.disconnect();
      }
    },
  };
}
