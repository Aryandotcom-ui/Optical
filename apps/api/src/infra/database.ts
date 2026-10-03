import type { Db } from './prisma';
import type { DependencyProbe } from './probes';

/** Readiness probe for Postgres, using the app's Prisma client. */
export function createDatabaseProbe(db: Db): DependencyProbe {
  return {
    name: 'database',
    async ping() {
      await db.$queryRaw`SELECT 1`;
    },
    async close() {
      await db.$disconnect();
    },
  };
}
