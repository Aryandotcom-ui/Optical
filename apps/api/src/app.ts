import Fastify, { LogController, type FastifyServerOptions } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import packageJson from '../package.json' with { type: 'json' };
import type { ApiEnv } from './config/env';
import type { Db } from './infra/prisma';
import type { DependencyProbe } from './infra/probes';
import type { Redis } from 'ioredis';
import { noopCache, RedisCache } from './lib/cache';
import { generateRequestId, REQUEST_ID_HEADER } from './lib/request-id';
import { CatalogController } from './modules/catalog/catalog.controller';
import { CatalogRepository } from './modules/catalog/catalog.repository';
import { catalogRoutes } from './modules/catalog/catalog.routes';
import { CatalogService } from './modules/catalog/catalog.service';
import { healthRoutes } from './modules/health/health.routes';
import { helpRoutes } from './modules/help/help.routes';
import { HelpService } from './modules/help/help.service';
import { HealthService } from './modules/health/health.service';
import { LensController } from './modules/lens/lens.controller';
import { LensRepository } from './modules/lens/lens.repository';
import { lensRoutes } from './modules/lens/lens.routes';
import { LensService } from './modules/lens/lens.service';
import { errorHandlerPlugin } from './plugins/error-handler';
import { openApiPlugin } from './plugins/openapi';
import { securityPlugin } from './plugins/security';

export const API_VERSION = packageJson.version;
const PROBE_PATHS = new Set(['/healthz', '/readyz']);

export interface AppDependencies {
  db: Db;
  /** Redis connection for caching; without one, reads go straight to the database. */
  cacheClient?: Redis;
  /** Readiness probes; closed when the app shuts down. */
  database: DependencyProbe;
  redis: DependencyProbe;
}

function loggerOptions(env: ApiEnv): FastifyServerOptions['logger'] {
  return {
    level: env.LOG_LEVEL,
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
      censor: '[redacted]',
    },
    ...(env.LOG_PRETTY
      ? {
          transport: {
            target: 'pino-pretty',
            options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
          },
        }
      : {}),
  };
}

/**
 * Builds the Fastify app without starting it. Dependencies are injected so
 * tests can swap real Postgres/Redis for fakes.
 */
export async function buildApp(env: ApiEnv, deps: AppDependencies) {
  const app = Fastify({
    logger: loggerOptions(env),
    genReqId: generateRequestId,
    logController: new LogController({
      requestIdLogLabel: 'requestId',
      // Orchestrators poll the probes every few seconds; don't flood the logs.
      disableRequestLogging: (request) => PROBE_PATHS.has(request.url),
    }),
    trustProxy: env.TRUST_PROXY,
    bodyLimit: 1_048_576,
    routerOptions: { ignoreTrailingSlash: true },
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.addHook('onRequest', (request, reply, done) => {
    void reply.header(REQUEST_ID_HEADER, request.id);
    done();
  });

  await app.register(errorHandlerPlugin);
  await app.register(securityPlugin, { allowedOrigins: env.CORS_ALLOWED_ORIGINS });
  await app.register(openApiPlugin, {
    publicUrl: env.API_PUBLIC_URL,
    version: API_VERSION,
    exposeUi: env.API_DOCS_ENABLED,
  });

  const healthService = new HealthService({
    serviceName: 'api',
    version: API_VERSION,
    database: deps.database,
    redis: deps.redis,
  });
  await app.register(healthRoutes, { service: healthService });

  const cache = deps.cacheClient ? new RedisCache(deps.cacheClient, app.log) : noopCache;
  const catalogRepository = new CatalogRepository(deps.db);
  const catalogService = new CatalogService(catalogRepository, cache);
  const lensService = new LensService(new LensRepository(deps.db), catalogRepository, cache);
  await app.register(
    async (v1) => {
      await v1.register(catalogRoutes, { controller: new CatalogController(catalogService) });
      await v1.register(lensRoutes, { controller: new LensController(lensService) });
      await v1.register(helpRoutes, { service: new HelpService(catalogRepository, cache) });
    },
    { prefix: '/v1' },
  );

  app.addHook('onClose', async () => {
    await Promise.allSettled([deps.database.close(), deps.redis.close()]);
  });

  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
