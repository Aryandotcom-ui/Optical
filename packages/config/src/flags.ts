/**
 * Feature flags. Defaults live here; the `FEATURE_FLAGS` environment
 * variable overrides them per deployment (e.g. `googleOAuth=on,analytics=off`).
 * Phase 6 adds database-backed overrides editable from admin settings.
 */
export const defaultFeatureFlags = {
  /** Sign in with Google. Scaffolded only; needs OAuth credentials. */
  googleOAuth: false,
  /** Privacy-respecting, Plausible-compatible analytics. Requires cookie consent. */
  analytics: false,
  /** Sentry-compatible error reporting. */
  errorReporting: false,
  /** Camera-based virtual try-on. */
  virtualTryOn: true,
  /** Guided frame recommendation quiz. */
  frameFinder: true,
  /** Cash on Delivery at checkout (limits live in commerce config). */
  cashOnDelivery: true,
  /** Developer pages under /dev. Always off in production builds. */
  devTools: true,
} as const satisfies Record<string, boolean>;

export type FeatureFlagName = keyof typeof defaultFeatureFlags;
export type FeatureFlags = Record<FeatureFlagName, boolean>;

const TRUE_VALUES = new Set(['on', 'true', '1', 'yes']);
const FALSE_VALUES = new Set(['off', 'false', '0', 'no']);

export class FeatureFlagParseError extends Error {
  override name = 'FeatureFlagParseError';
}

function isFlagName(name: string): name is FeatureFlagName {
  return Object.hasOwn(defaultFeatureFlags, name);
}

/**
 * Parses a `FEATURE_FLAGS` string such as `"googleOAuth=on, analytics=off"`
 * and merges it over the defaults. Unknown flags and unreadable values throw,
 * so a typo fails at startup instead of silently doing nothing.
 */
export function resolveFeatureFlags(
  overrides: string | undefined,
  defaults: FeatureFlags = defaultFeatureFlags,
): FeatureFlags {
  const flags: FeatureFlags = { ...defaults };
  if (!overrides?.trim()) return flags;

  for (const rawPair of overrides.split(',')) {
    const pair = rawPair.trim();
    if (!pair) continue;
    const [rawName, rawValue, ...rest] = pair.split('=');
    const name = rawName?.trim() ?? '';
    const value = rawValue?.trim().toLowerCase() ?? '';

    if (rest.length > 0 || !name || !value) {
      throw new FeatureFlagParseError(`"${pair}" should look like name=on or name=off.`);
    }
    if (!isFlagName(name)) {
      const known = Object.keys(defaults).join(', ');
      throw new FeatureFlagParseError(`Unknown feature flag "${name}". Known flags: ${known}.`);
    }
    if (TRUE_VALUES.has(value)) flags[name] = true;
    else if (FALSE_VALUES.has(value)) flags[name] = false;
    else throw new FeatureFlagParseError(`Flag "${name}" has value "${value}"; use on or off.`);
  }
  return flags;
}
