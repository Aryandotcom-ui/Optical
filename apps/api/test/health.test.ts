import { healthResponseSchema, readinessResponseSchema } from '@optical/shared/api';
import { afterEach, describe, expect, it } from 'vitest';
import { HealthService } from '../src/modules/health/health.service';
import { buildTestApp, fakeProbe } from './helpers';

type TestApp = Awaited<ReturnType<typeof buildTestApp>>['app'];
let app: TestApp | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('GET /healthz', () => {
  it('reports liveness without touching dependencies', async () => {
    const built = await buildTestApp({ database: 'down', redis: 'down' });
    app = built.app;
    const response = await app.inject({ method: 'GET', url: '/healthz' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const body = healthResponseSchema.parse(response.json());
    expect(body.service).toBe('api');
  });
});

describe('GET /readyz', () => {
  it('is ready when Postgres and Redis respond', async () => {
    app = (await buildTestApp()).app;
    const response = await app.inject({ method: 'GET', url: '/readyz' });

    expect(response.statusCode).toBe(200);
    const body = readinessResponseSchema.parse(response.json());
    expect(body.status).toBe('ready');
    expect(body.checks.database.status).toBe('up');
    expect(body.checks.redis.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('is degraded but still 200 when only Redis is down', async () => {
    app = (await buildTestApp({ redis: 'down' })).app;
    const response = await app.inject({ method: 'GET', url: '/readyz' });

    expect(response.statusCode).toBe(200);
    const body = readinessResponseSchema.parse(response.json());
    expect(body.status).toBe('degraded');
    expect(body.checks.redis).toMatchObject({ status: 'down', latencyMs: null });
    expect(body.checks.redis.message).toContain('refused');
  });

  it('is unavailable with 503 when the database is down', async () => {
    app = (await buildTestApp({ database: 'down' })).app;
    const response = await app.inject({ method: 'GET', url: '/readyz' });

    expect(response.statusCode).toBe(503);
    expect(readinessResponseSchema.parse(response.json()).status).toBe('unavailable');
  });
});

describe('HealthService', () => {
  it('treats a dependency that never answers as down after the timeout', async () => {
    const service = new HealthService({
      serviceName: 'api',
      version: '1.0.0',
      database: fakeProbe('database', 'hang'),
      redis: fakeProbe('redis'),
      timeoutMs: 20,
    });
    const readiness = await service.readiness();
    expect(readiness.status).toBe('unavailable');
    expect(readiness.checks.database.message).toMatch(/No response within 20 ms/);
  });

  it('reports uptime from the injected clock', () => {
    let now = 1_000_000;
    const service = new HealthService({
      serviceName: 'api',
      version: '1.0.0',
      database: fakeProbe('database'),
      redis: fakeProbe('redis'),
      now: () => now,
    });
    now += 42_400;
    expect(service.health()).toMatchObject({
      uptimeSeconds: 42,
      time: new Date(now).toISOString(),
    });
  });
});

describe('shutdown', () => {
  it('closes dependency connections when the app closes', async () => {
    const built = await buildTestApp();
    await built.app.close();
    expect(built.database.closed).toBe(true);
    expect(built.redis.closed).toBe(true);
  });
});
