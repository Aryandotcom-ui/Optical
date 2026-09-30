import type { DependencyStatus, HealthResponse, ReadinessResponse } from '@optical/shared/api';
import type { DependencyProbe } from '../../infra/probes';

export interface HealthServiceDeps {
  serviceName: string;
  version: string;
  database: DependencyProbe;
  redis: DependencyProbe;
  /** Milliseconds before a dependency check counts as down. */
  timeoutMs?: number;
  now?: () => number;
}

async function checkWithTimeout(
  probe: DependencyProbe,
  timeoutMs: number,
  now: () => number,
): Promise<DependencyStatus> {
  const started = now();
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      probe.ping(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`No response within ${timeoutMs} ms`));
        }, timeoutMs);
      }),
    ]);
    return { status: 'up', latencyMs: Math.max(0, now() - started) };
  } catch (error) {
    return { status: 'down', latencyMs: null, message: (error as Error).message || 'Unreachable' };
  } finally {
    clearTimeout(timer);
  }
}

export class HealthService {
  private readonly startedAt: number;
  private readonly now: () => number;

  constructor(private readonly deps: HealthServiceDeps) {
    this.now = deps.now ?? Date.now;
    this.startedAt = this.now();
  }

  /** Liveness: the process is up and serving requests. Never touches dependencies. */
  health(): HealthResponse {
    const now = this.now();
    return {
      status: 'ok',
      service: this.deps.serviceName,
      version: this.deps.version,
      uptimeSeconds: Math.round((now - this.startedAt) / 1000),
      time: new Date(now).toISOString(),
    };
  }

  /**
   * Readiness: can this instance serve traffic? The database is required
   * (`unavailable` without it). Redis is optional: without it the API still
   * works with rate limiting failing open, so it reports `degraded`.
   */
  async readiness(): Promise<ReadinessResponse> {
    const timeoutMs = this.deps.timeoutMs ?? 1_500;
    const [database, redis] = await Promise.all([
      checkWithTimeout(this.deps.database, timeoutMs, this.now),
      checkWithTimeout(this.deps.redis, timeoutMs, this.now),
    ]);
    const status =
      database.status === 'down' ? 'unavailable' : redis.status === 'down' ? 'degraded' : 'ready';
    return { status, checks: { database, redis } };
  }
}
