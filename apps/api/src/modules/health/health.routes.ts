import { healthResponseSchema, readinessResponseSchema } from '@optical/shared/api';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { HealthService } from './health.service';

export interface HealthRoutesOptions {
  service: HealthService;
}

export const healthRoutes: FastifyPluginAsyncZod<HealthRoutesOptions> = async (
  app,
  { service },
) => {
  app.get(
    '/healthz',
    {
      schema: {
        tags: ['system'],
        summary: 'Liveness probe',
        description: 'Returns 200 while the process is running. Does not check dependencies.',
        response: { 200: healthResponseSchema },
      },
    },
    (_request, reply) => {
      void reply.header('cache-control', 'no-store');
      return service.health();
    },
  );

  app.get(
    '/readyz',
    {
      schema: {
        tags: ['system'],
        summary: 'Readiness probe',
        description:
          'Checks Postgres and Redis. 200 when ready or degraded (Redis down), 503 when the database is unreachable.',
        response: { 200: readinessResponseSchema, 503: readinessResponseSchema },
      },
    },
    async (_request, reply) => {
      const readiness = await service.readiness();
      void reply.header('cache-control', 'no-store');
      return reply.status(readiness.status === 'unavailable' ? 503 : 200).send(readiness);
    },
  );

  return Promise.resolve();
};
