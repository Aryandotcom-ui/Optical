import { healthResponseSchema, type HealthResponse } from '@optical/shared/api';
import packageJson from '../../../package.json' with { type: 'json' };

export const dynamic = 'force-dynamic';

const startedAt = Date.now();

/** Liveness probe for the web server (used by container healthchecks). */
export function GET() {
  const now = Date.now();
  const body: HealthResponse = healthResponseSchema.parse({
    status: 'ok',
    service: 'web',
    version: packageJson.version,
    uptimeSeconds: Math.round((now - startedAt) / 1000),
    time: new Date(now).toISOString(),
  });
  return Response.json(body, { headers: { 'cache-control': 'no-store' } });
}
