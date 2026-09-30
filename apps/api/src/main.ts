import closeWithGrace from 'close-with-grace';
import { EnvValidationError } from '@optical/config/env';
import { buildApp } from './app';
import { loadApiEnv, loadDotEnvFile } from './config/env';
import { createDatabaseProbe } from './infra/database';
import { createPrismaClient } from './infra/prisma';
import { createRedisProbe } from './infra/redis';

function loadEnvOrExit() {
  loadDotEnvFile();
  try {
    return loadApiEnv();
  } catch (error) {
    if (error instanceof EnvValidationError) {
      process.stderr.write(`\n${error.message}\n\n`);
      process.exit(1);
    }
    throw error;
  }
}

const env = loadEnvOrExit();
const db = createPrismaClient(env.DATABASE_URL);
const redis = createRedisProbe(env.REDIS_URL);
const app = await buildApp(env, {
  db,
  cacheClient: redis.client,
  database: createDatabaseProbe(db),
  redis,
});

closeWithGrace({ delay: 10_000 }, async ({ signal, err }) => {
  if (err) app.log.error({ err }, 'Shutting down after an unexpected error');
  else app.log.info({ signal }, 'Shutting down');
  await app.close();
});

try {
  await app.listen({ host: env.API_HOST, port: env.API_PORT });
  app.log.info(`API docs at ${env.API_PUBLIC_URL}/docs`);
} catch (error) {
  app.log.fatal({ err: error }, 'Could not start the API');
  process.exit(1);
}
