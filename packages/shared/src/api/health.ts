import { z } from 'zod';

export const healthResponseSchema = z
  .object({
    status: z.literal('ok'),
    service: z.string(),
    version: z.string(),
    uptimeSeconds: z.number().nonnegative(),
    time: z.iso.datetime(),
  })
  .meta({ id: 'Health' });
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const dependencyStatusSchema = z.object({
  status: z.enum(['up', 'down']),
  latencyMs: z.number().nonnegative().nullable(),
  message: z.string().optional(),
});
export type DependencyStatus = z.infer<typeof dependencyStatusSchema>;

export const readinessResponseSchema = z
  .object({
    status: z.enum(['ready', 'degraded', 'unavailable']),
    checks: z.object({
      database: dependencyStatusSchema,
      redis: dependencyStatusSchema,
    }),
  })
  .meta({ id: 'Readiness' });
export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;
