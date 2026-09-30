import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

export type Db = PrismaClient;

/** Creates a Prisma client over the `pg` driver adapter (Prisma 7). */
export function createPrismaClient(
  connectionString: string,
  options: { maxConnections?: number } = {},
): Db {
  const adapter = new PrismaPg({
    connectionString,
    max: options.maxConnections ?? 10,
    connectionTimeoutMillis: 5_000,
  });
  return new PrismaClient({ adapter });
}
