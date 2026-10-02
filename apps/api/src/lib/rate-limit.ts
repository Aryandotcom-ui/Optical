import type { FastifyBaseLogger, FastifyReply, FastifyRequest } from 'fastify';
import type { Redis } from 'ioredis';
import { AppError } from './app-error';

export interface RateLimitRule {
  /** Bucket name, e.g. "coupon". */
  name: string;
  /** Requests allowed per window, per client. */
  max: number;
  windowSeconds: number;
}

export interface RateLimiter {
  /** Counts a hit and returns the number of hits in the current window. */
  hit(key: string, windowSeconds: number): Promise<number>;
  /** Multiplies every limit (RATE_LIMIT_SCALE), e.g. for end-to-end tests from one machine. */
  scale?: number;
}

/**
 * Fixed-window counters in Redis. If Redis is unavailable the limiter
 * fails open (the request is allowed) and logs a warning: an outage of the
 * cache must not take checkout down.
 */
export class RedisRateLimiter implements RateLimiter {
  constructor(
    private readonly redis: Redis,
    private readonly log: Pick<FastifyBaseLogger, 'warn'>,
    readonly scale = 1,
  ) {}

  async hit(key: string, windowSeconds: number): Promise<number> {
    try {
      const [[, count]] = (await this.redis
        .multi()
        .incr(key)
        .expire(key, windowSeconds, 'NX')
        .exec()) as [[Error | null, number]];
      return count;
    } catch (error) {
      this.log.warn({ err: error, key }, 'Rate limiter unavailable; allowing the request');
      return 0;
    }
  }
}

/** In-process counters, for tests and single-instance development without Redis. */
export class MemoryRateLimiter implements RateLimiter {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly now: () => number = Date.now,
    readonly scale = 1,
  ) {}

  hit(key: string, windowSeconds: number): Promise<number> {
    const now = this.now();
    const window = this.windows.get(key);
    if (!window || window.resetAt <= now) {
      this.windows.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
      return Promise.resolve(1);
    }
    window.count += 1;
    return Promise.resolve(window.count);
  }
}

/** A preHandler that limits requests per client IP for one rule. */
export function rateLimit(limiter: RateLimiter, base: RateLimitRule) {
  const rule = { ...base, max: Math.ceil(base.max * (limiter.scale ?? 1)) };
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const window = Math.floor(Date.now() / 1000 / rule.windowSeconds);
    const count = await limiter.hit(`rl:${rule.name}:${request.ip}:${window}`, rule.windowSeconds);
    void reply.header('ratelimit-limit', rule.max);
    void reply.header('ratelimit-remaining', Math.max(0, rule.max - count));
    if (count > rule.max) {
      void reply.header('retry-after', rule.windowSeconds);
      throw new AppError('RATE_LIMITED', 'Too many attempts. Wait a minute and try again.');
    }
  };
}

/** Limits for sensitive endpoints (spec: stricter on upload, coupon, contact, auth). */
export const rateLimits = {
  coupon: { name: 'coupon', max: 10, windowSeconds: 60 },
  upload: { name: 'upload', max: 10, windowSeconds: 300 },
  track: { name: 'track', max: 10, windowSeconds: 60 },
  placeOrder: { name: 'place-order', max: 10, windowSeconds: 300 },
  paymentRetry: { name: 'payment-retry', max: 10, windowSeconds: 300 },
  cartWrite: { name: 'cart-write', max: 60, windowSeconds: 60 },
} satisfies Record<string, RateLimitRule>;
