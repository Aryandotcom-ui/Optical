import { isAbsolute, join } from 'node:path';
import multipart from '@fastify/multipart';
import Fastify, { LogController, type FastifyServerOptions } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { commerce } from '@optical/config/commerce';
import packageJson from '../package.json' with { type: 'json' };
import { findWorkspaceRoot, type ApiEnv } from './config/env';
import type { Db } from './infra/prisma';
import type { DependencyProbe } from './infra/probes';
import type { Redis } from 'ioredis';
import { LocalDiskStorage, FileLinks, type StorageProvider } from './infra/storage';
import type { JobQueue } from './infra/queue';
import { noopCache, RedisCache } from './lib/cache';
import { noScanner } from './lib/file-sanitiser';
import { MemoryRateLimiter, RedisRateLimiter, type RateLimiter } from './lib/rate-limit';
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
import { cartRoutes } from './modules/cart/cart.routes';
import { CartService } from './modules/cart/cart.service';
import { checkoutRoutes } from './modules/checkout/checkout.routes';
import { CheckoutService } from './modules/checkout/checkout.service';
import { orderRoutes } from './modules/orders/orders.routes';
import { OrdersService } from './modules/orders/orders.service';
import type { MockBank } from './modules/payments/mock';
import { PaymentGateway } from './modules/payments/payment-gateway';
import { paymentRoutes } from './modules/payments/payments.routes';
import { createPaymentRegistry } from './modules/payments/registry';
import { prescriptionRoutes } from './modules/prescriptions/prescriptions.routes';
import {
  MAX_UPLOAD_BYTES,
  PrescriptionService,
} from './modules/prescriptions/prescriptions.service';
import { csrfPlugin } from './plugins/csrf';
import { errorHandlerPlugin } from './plugins/error-handler';
import { openApiPlugin } from './plugins/openapi';
import { securityPlugin } from './plugins/security';
import { sessionPlugin } from './plugins/session';

export const API_VERSION = packageJson.version;
const PROBE_PATHS = new Set(['/healthz', '/readyz']);

export interface AppDependencies {
  db: Db;
  /** Redis connection for caching; without one, reads go straight to the database. */
  cacheClient?: Redis;
  /** Readiness probes; closed when the app shuts down. */
  database: DependencyProbe;
  redis: DependencyProbe;
  /** Background jobs (mock webhooks, email wake-ups). */
  jobs: JobQueue;
  /** The mock payment provider's pretend bank. */
  mockBank: MockBank;
  /** Defaults to Redis counters when `cacheClient` is set, else in-process counters. */
  rateLimiter?: RateLimiter;
  /** Defaults to local disk at UPLOAD_DIR. */
  storage?: StorageProvider;
  now?: () => Date;
}

/** Relative paths are resolved from the repository root, where `.env` lives. */
export function resolveUploadDir(dir: string): string {
  return isAbsolute(dir) ? dir : join(findWorkspaceRoot() ?? process.cwd(), dir);
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

  // JSON and multipart only: a cross-site HTML form can send text/plain, never JSON.
  app.removeContentTypeParser('text/plain');
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.addHook('onRequest', (request, reply, done) => {
    void reply.header(REQUEST_ID_HEADER, request.id);
    done();
  });

  await app.register(errorHandlerPlugin);
  await app.register(securityPlugin, { allowedOrigins: env.CORS_ALLOWED_ORIGINS });
  await app.register(sessionPlugin, { secure: env.COOKIE_SECURE });
  await app.register(csrfPlugin, {
    allowedOrigins: env.CORS_ALLOWED_ORIGINS,
    exemptPrefixes: ['/v1/webhooks/'],
  });
  await app.register(multipart, {
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 0, parts: 1 },
    throwFileSizeLimit: true,
  });
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
  const now = deps.now ?? (() => new Date());
  const limiter =
    deps.rateLimiter ??
    (deps.cacheClient ? new RedisRateLimiter(deps.cacheClient, app.log) : new MemoryRateLimiter());
  const cartService = new CartService(deps.db, lensService, now);
  const gateway = new PaymentGateway(
    deps.db,
    createPaymentRegistry(env, deps.mockBank),
    deps.jobs,
    {
      secret: env.APP_SECRET,
      siteUrl: env.NEXT_PUBLIC_SITE_URL,
      holdMinutes: commerce.policies.stockReservationMinutes,
      mockPendingSettleSeconds: env.MOCK_PENDING_SETTLE_SECONDS,
    },
    app.log,
    now,
  );
  const prescriptions = new PrescriptionService(
    deps.db,
    deps.storage ?? new LocalDiskStorage(resolveUploadDir(env.UPLOAD_DIR)),
    new FileLinks(env.APP_SECRET, env.API_PUBLIC_URL),
    noScanner,
  );
  await app.register(
    async (v1) => {
      await v1.register(catalogRoutes, { controller: new CatalogController(catalogService) });
      await v1.register(lensRoutes, { controller: new LensController(lensService) });
      await v1.register(helpRoutes, { service: new HelpService(catalogRepository, cache) });
      await v1.register(cartRoutes, { service: cartService, limiter });
      await v1.register(checkoutRoutes, {
        service: new CheckoutService(deps.db, cartService, gateway, now),
        limiter,
      });
      await v1.register(orderRoutes, {
        service: new OrdersService(deps.db, gateway),
        gateway,
        limiter,
      });
      await v1.register(paymentRoutes, { gateway });
      await v1.register(prescriptionRoutes, { service: prescriptions, limiter });
    },
    { prefix: '/v1' },
  );

  app.addHook('onClose', async () => {
    await Promise.allSettled([deps.database.close(), deps.redis.close(), deps.jobs.close()]);
  });

  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
