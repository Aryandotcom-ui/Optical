import 'server-only';
import { envField, nodeEnvSchema, parseEnv } from '@optical/config/env';
import { resolveFeatureFlags } from '@optical/config/flags';
import { z } from 'zod';

const webEnvSchema = z
  .object({
    NODE_ENV: nodeEnvSchema,
    NEXT_PUBLIC_SITE_URL: envField.httpUrl().default('http://localhost:3000'),
    NEXT_PUBLIC_API_URL: envField.httpUrl().default('http://localhost:4000'),
    API_INTERNAL_URL: envField.httpUrl().optional(),
    FEATURE_FLAGS: z.string().optional(),
  })
  .transform((env, ctx) => {
    try {
      return {
        ...env,
        // Server-side calls can use a private network address (e.g. http://api:4000 in Docker).
        API_INTERNAL_URL: env.API_INTERNAL_URL ?? env.NEXT_PUBLIC_API_URL,
        featureFlags: resolveFeatureFlags(env.FEATURE_FLAGS),
      };
    } catch (error) {
      ctx.addIssue({ code: 'custom', path: ['FEATURE_FLAGS'], message: (error as Error).message });
      return z.NEVER;
    }
  });

export type WebEnv = z.infer<typeof webEnvSchema>;

let cached: WebEnv | undefined;

/** Validated server environment. Throws `EnvValidationError` listing every problem. */
export function getEnv(): WebEnv {
  cached ??= parseEnv('web', webEnvSchema, process.env);
  return cached;
}
