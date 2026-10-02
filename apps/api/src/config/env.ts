import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { envField, nodeEnvSchema, parseEnv } from '@optical/config/env';
import { brand } from '@optical/config/brand';
import { resolveFeatureFlags } from '@optical/config/flags';
import { z } from 'zod';

const logLevels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

export const apiEnvSchema = z
  .object({
    NODE_ENV: nodeEnvSchema,
    API_HOST: z.string().default('0.0.0.0'),
    API_PORT: envField.port(4000),
    API_PUBLIC_URL: envField.httpUrl().default('http://localhost:4000'),
    /** How the worker reaches the API (e.g. http://api:4000 in Docker). */
    API_INTERNAL_URL: envField.httpUrl().optional(),
    CORS_ALLOWED_ORIGINS: envField.list().default(['http://localhost:3000']),
    DATABASE_URL: z.url({
      protocol: /^postgres(ql)?$/,
      error: 'must be a postgres:// connection URL',
    }),
    REDIS_URL: z.url({ protocol: /^rediss?$/, error: 'must be a redis:// or rediss:// URL' }),
    LOG_LEVEL: z.enum(logLevels).default('info'),
    LOG_PRETTY: envField.boolean().optional(),
    TRUST_PROXY: envField.boolean().default(false),
    API_DOCS_ENABLED: envField.boolean().default(true),
    FEATURE_FLAGS: z.string().optional(),
    /** Signs guest sessions, order links, upload URLs and mock payment webhooks. */
    APP_SECRET: envField.secret(32),
    /** Storefront origin, for links in emails and payment return URLs. */
    NEXT_PUBLIC_SITE_URL: envField.httpUrl().default('http://localhost:3000'),
    COOKIE_SECURE: envField.boolean().optional(),
    UPLOAD_DIR: z.string().default('.data/uploads'),
    SMTP_URL: z
      .url({ protocol: /^smtps?$/, error: 'must be an smtp:// or smtps:// URL' })
      .default('smtp://localhost:1025'),
    EMAIL_FROM: z.string().optional(),
    /** Multiplies every rate limit; raise it only for test environments that share one IP. */
    RATE_LIMIT_SCALE: z.coerce.number().min(1).max(1000).default(1),
    MOCK_PAYMENTS_ENABLED: envField.boolean().optional(),
    MOCK_PENDING_SETTLE_SECONDS: z.coerce.number().int().min(1).max(3600).default(30),
    RAZORPAY_KEY_ID: z.string().optional(),
    RAZORPAY_KEY_SECRET: z.string().optional(),
    RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    const groups = {
      Razorpay: ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET'],
      Stripe: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'],
    } as const;
    for (const [provider, keys] of Object.entries(groups)) {
      const set = keys.filter((key) => env[key] !== undefined);
      if (set.length > 0 && set.length < keys.length) {
        for (const key of keys.filter((entry) => env[entry] === undefined))
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: `${provider} is partly configured; set ${keys.join(', ')} together, or none of them.`,
          });
      }
    }
    if (env.NODE_ENV === 'production' && env.MOCK_PAYMENTS_ENABLED === true)
      ctx.addIssue({
        code: 'custom',
        path: ['MOCK_PAYMENTS_ENABLED'],
        message: 'The mock payment provider cannot be enabled in production.',
      });
  })
  .transform((env, ctx) => {
    try {
      const featureFlags = resolveFeatureFlags(env.FEATURE_FLAGS);
      const production = env.NODE_ENV === 'production';
      return {
        ...env,
        LOG_PRETTY: env.LOG_PRETTY ?? env.NODE_ENV === 'development',
        COOKIE_SECURE: env.COOKIE_SECURE ?? production,
        API_INTERNAL_URL: env.API_INTERNAL_URL ?? env.API_PUBLIC_URL,
        MOCK_PAYMENTS_ENABLED: env.MOCK_PAYMENTS_ENABLED ?? !production,
        EMAIL_FROM:
          env.EMAIL_FROM ?? `${brand.name} <orders@${new URL(env.NEXT_PUBLIC_SITE_URL).hostname}>`,
        featureFlags,
      };
    } catch (error) {
      ctx.addIssue({ code: 'custom', path: ['FEATURE_FLAGS'], message: (error as Error).message });
      return z.NEVER;
    }
  });

export type ApiEnv = z.infer<typeof apiEnvSchema>;

/** Validates the API environment. Throws `EnvValidationError` listing every problem. */
export function loadApiEnv(source: Record<string, string | undefined> = process.env): ApiEnv {
  return parseEnv('api', apiEnvSchema, source);
}

/** Walks up from `start` to the directory containing `pnpm-workspace.yaml`. */
export function findWorkspaceRoot(start = process.cwd()): string | undefined {
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/**
 * Loads the monorepo's root `.env` into `process.env` when it exists
 * (or the file named by `ENV_FILE`). Variables already set in the
 * environment win, so platforms that inject env vars are never overridden.
 */
export function loadDotEnvFile(): string | undefined {
  const root = findWorkspaceRoot();
  const path = process.env.ENV_FILE ?? (root ? join(root, '.env') : undefined);
  if (!path || !existsSync(path)) return undefined;
  process.loadEnvFile(path);
  return path;
}
