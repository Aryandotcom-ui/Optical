import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { envField, nodeEnvSchema, parseEnv } from '@optical/config/env';
import { resolveFeatureFlags } from '@optical/config/flags';
import { z } from 'zod';

const logLevels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

export const apiEnvSchema = z
  .object({
    NODE_ENV: nodeEnvSchema,
    API_HOST: z.string().default('0.0.0.0'),
    API_PORT: envField.port(4000),
    API_PUBLIC_URL: envField.httpUrl().default('http://localhost:4000'),
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
  })
  .transform((env, ctx) => {
    try {
      const featureFlags = resolveFeatureFlags(env.FEATURE_FLAGS);
      return { ...env, LOG_PRETTY: env.LOG_PRETTY ?? env.NODE_ENV === 'development', featureFlags };
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
