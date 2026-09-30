import type { HealthResponse, ReadinessResponse } from '@optical/shared/api';

export type ServiceKey = 'web' | 'api' | 'database' | 'redis';
export type ServiceState = 'up' | 'down' | 'unknown';
export type OverallState = ReadinessResponse['status'];

export interface ServiceRow {
  key: ServiceKey;
  state: ServiceState;
  latencyMs: number | null;
  /** Message key under `status.*` explaining a non-operational state. */
  hint?: 'apiDownHint' | 'servicesDownHint' | 'unknownBecauseApiDown' | 'redisDownImpact';
}

export interface SystemStatus {
  overall: OverallState;
  apiVersion: string | null;
  rows: ServiceRow[];
}

/**
 * Combines the API liveness and readiness responses into what the status
 * page shows. `null` means the API could not be reached for that call.
 */
export function deriveSystemStatus(
  health: HealthResponse | null,
  readiness: ReadinessResponse | null,
): SystemStatus {
  const apiUp = health !== null;
  const rows: ServiceRow[] = [
    { key: 'web', state: 'up', latencyMs: null },
    {
      key: 'api',
      state: apiUp ? 'up' : 'down',
      latencyMs: null,
      ...(apiUp ? {} : { hint: 'apiDownHint' }),
    },
  ];

  if (!readiness) {
    rows.push(
      { key: 'database', state: 'unknown', latencyMs: null, hint: 'unknownBecauseApiDown' },
      { key: 'redis', state: 'unknown', latencyMs: null, hint: 'unknownBecauseApiDown' },
    );
    return { overall: 'unavailable', apiVersion: health?.version ?? null, rows };
  }

  const { database, redis } = readiness.checks;
  rows.push(
    {
      key: 'database',
      state: database.status,
      latencyMs: database.latencyMs,
      ...(database.status === 'down' ? { hint: 'servicesDownHint' as const } : {}),
    },
    {
      key: 'redis',
      state: redis.status,
      latencyMs: redis.latencyMs,
      ...(redis.status === 'down' ? { hint: 'redisDownImpact' as const } : {}),
    },
  );

  return {
    overall: apiUp ? readiness.status : 'unavailable',
    apiVersion: health?.version ?? null,
    rows,
  };
}
