import { z } from 'zod';

/**
 * Thrown when environment variables fail validation. The message lists every
 * problem at once, with the variable name and what was expected, so a
 * misconfigured deployment can be fixed in one pass.
 */
export class EnvValidationError extends Error {
  override name = 'EnvValidationError';

  constructor(
    readonly appName: string,
    readonly problems: readonly string[],
  ) {
    super(
      [
        `Invalid environment for ${appName}. Fix the following and restart:`,
        ...problems.map((problem) => `  - ${problem}`),
        'See .env.example for every variable, its default and its purpose.',
      ].join('\n'),
    );
  }
}

type EnvSource = Record<string, string | undefined>;

/**
 * Validates `source` (usually `process.env`) against `schema`.
 *
 * Empty strings are treated as unset, so `FOO=` in a `.env` file falls back
 * to the schema default instead of failing as an empty value.
 */
export function parseEnv<TSchema extends z.ZodType>(
  appName: string,
  schema: TSchema,
  source: EnvSource,
): z.infer<TSchema> {
  const cleaned: EnvSource = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && value !== '') cleaned[key] = value;
  }

  const result = schema.safeParse(cleaned);
  if (result.success) return result.data;

  const problems = result.error.issues.map((issue) => {
    const key = issue.path.join('.') || '(root)';
    const received = issue.code === 'invalid_type' && cleaned[key] === undefined;
    return received ? `${key}: is required but not set.` : `${key}: ${issue.message}`;
  });
  throw new EnvValidationError(appName, problems);
}

/** Reusable field builders for environment schemas. */
export const envField = {
  /** A TCP port number. */
  port: (fallback: number) => z.coerce.number().int().min(1).max(65_535).default(fallback),
  /** An absolute http(s) URL, without a trailing slash. */
  httpUrl: () =>
    z
      .url({ protocol: /^https?$/, error: 'must be an http:// or https:// URL' })
      .transform((value) => value.replace(/\/+$/, '')),
  /** A comma-separated list, trimmed, with empty entries removed. */
  list: () =>
    z.string().transform((value) =>
      value
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  /** A boolean written as true/false, on/off, 1/0 or yes/no. */
  boolean: () =>
    z.stringbool({ truthy: ['true', 'on', '1', 'yes'], falsy: ['false', 'off', '0', 'no'] }),
  /** A secret that must be long enough to be safe. */
  secret: (minLength = 32) =>
    z.string().min(minLength, { error: `must be at least ${minLength} characters` }),
};

export const nodeEnvSchema = z.enum(['development', 'test', 'production']).default('development');
