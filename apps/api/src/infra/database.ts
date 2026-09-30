import pg from 'pg';
import type { DependencyProbe } from './probes';

/**
 * Minimal Postgres connection used for readiness checks. Phase 1 replaces
 * this with the Prisma client, which uses the same `pg` driver underneath.
 */
export function createDatabaseProbe(connectionString: string): DependencyProbe {
  const pool = new pg.Pool({
    connectionString,
    max: 2,
    connectionTimeoutMillis: 2_000,
    idleTimeoutMillis: 10_000,
  });
  // An idle client losing its connection must not crash the process.
  pool.on('error', () => undefined);

  return {
    name: 'database',
    async ping() {
      await pool.query('SELECT 1');
    },
    async close() {
      await pool.end();
    },
  };
}
