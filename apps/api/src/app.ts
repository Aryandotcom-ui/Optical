import Fastify, { LogController, type FastifyServerOptions } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import packageJson from '../package.json' with { type: 'json' };
import type { ApiEnv } from './config/env';
import type { DependencyProbe } from './infra/probes';
import { generateRequestId, REQUEST_ID_HEADER } from './lib/request-id';
import { healthRoutes } from './modules/health/health.routes';
import { HealthService } from './modules/health/health.service';
import { errorHandlerPlugin } from './plugins/error-handler';
import { openApiPlugin } from './plugins/openapi';
import { securityPlugin } from './plugins/security';

export const API_VERSION = packageJson.version;
const PROBE_PATHS = new Set(['/healthz', '/readyz']);

export interface AppDependencies {
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

  app.addHook('onClose', async () => {
    await Promise.allSettled([deps.database.close(), deps.redis.close()]);
  });

  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
