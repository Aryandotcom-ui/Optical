import type { HealthResponse, ReadinessResponse } from '@optical/shared/api';
import { describe, expect, it } from 'vitest';
import { deriveSystemStatus } from './derive-status';

const health: HealthResponse = {
  status: 'ok',
  service: 'api',
  version: '1.2.3',
  uptimeSeconds: 10,
  time: '2026-09-30T10:00:00.000Z',
};

function readiness(database: 'up' | 'down', redis: 'up' | 'down'): ReadinessResponse {
  const check = (status: 'up' | 'down') => ({ status, latencyMs: status === 'up' ? 3 : null });
  const status = database === 'down' ? 'unavailable' : redis === 'down' ? 'degraded' : 'ready';
  return { status, checks: { database: check(database), redis: check(redis) } };
}

describe('deriveSystemStatus', () => {
  it('reports everything operational when the API is ready', () => {
    const result = deriveSystemStatus(health, readiness('up', 'up'));
    expect(result.overall).toBe('ready');
    expect(result.apiVersion).toBe('1.2.3');
    expect(result.rows.map((row) => row.state)).toEqual(['up', 'up', 'up', 'up']);
    expect(result.rows.every((row) => row.hint === undefined)).toBe(true);
  });

  it('explains the impact when only Redis is down', () => {
    const result = deriveSystemStatus(health, readiness('up', 'down'));
    expect(result.overall).toBe('degraded');
    expect(result.rows.find((row) => row.key === 'redis')).toMatchObject({
      state: 'down',
      hint: 'redisDownImpact',
    });
  });

  it('points to docker when the database is down', () => {
    const result = deriveSystemStatus(health, readiness('down', 'up'));
    expect(result.overall).toBe('unavailable');
    expect(result.rows.find((row) => row.key === 'database')?.hint).toBe('servicesDownHint');
  });

  it('marks dependencies unknown, not down, when the API is unreachable', () => {
    const result = deriveSystemStatus(null, null);
    expect(result.overall).toBe('unavailable');
    expect(result.apiVersion).toBeNull();
    expect(result.rows).toEqual([
      { key: 'web', state: 'up', latencyMs: null },
      { key: 'api', state: 'down', latencyMs: null, hint: 'apiDownHint' },
      { key: 'database', state: 'unknown', latencyMs: null, hint: 'unknownBecauseApiDown' },
      { key: 'redis', state: 'unknown', latencyMs: null, hint: 'unknownBecauseApiDown' },
    ]);
  });

  it('treats the API as down if liveness failed even when readiness answered', () => {
    const result = deriveSystemStatus(null, readiness('up', 'up'));
    expect(result.overall).toBe('unavailable');
    expect(result.rows[1]).toMatchObject({ key: 'api', state: 'down' });
  });
});
