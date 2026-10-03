import { describe, expect, it } from 'vitest';
import { defaultFeatureFlags, FeatureFlagParseError, resolveFeatureFlags } from './flags';

describe('resolveFeatureFlags', () => {
  it('returns defaults when no overrides are given', () => {
    expect(resolveFeatureFlags(undefined)).toEqual(defaultFeatureFlags);
    expect(resolveFeatureFlags('  ')).toEqual(defaultFeatureFlags);
  });

  it('applies on/off style overrides and ignores whitespace and empty entries', () => {
    const flags = resolveFeatureFlags(' googleOAuth=on , virtualTryOn = OFF ,, analytics=1 ');
    expect(flags.googleOAuth).toBe(true);
    expect(flags.virtualTryOn).toBe(false);
    expect(flags.analytics).toBe(true);
    expect(flags.frameFinder).toBe(defaultFeatureFlags.frameFinder);
  });

  it('does not mutate the defaults', () => {
    resolveFeatureFlags('frameFinder=off');
    expect(defaultFeatureFlags.frameFinder).toBe(true);
  });

  it('rejects unknown flags with the list of known ones', () => {
    expect(() => resolveFeatureFlags('googleOauth=on')).toThrow(
      /Unknown feature flag "googleOauth".*googleOAuth/,
    );
  });

  it('rejects unreadable values and malformed pairs', () => {
    expect(() => resolveFeatureFlags('analytics=maybe')).toThrow(FeatureFlagParseError);
    expect(() => resolveFeatureFlags('analytics')).toThrow(/name=on/);
    expect(() => resolveFeatureFlags('analytics=on=off')).toThrow(/name=on/);
  });

  it('refuses inherited object keys as flag names', () => {
    expect(() => resolveFeatureFlags('toString=on')).toThrow(/Unknown feature flag/);
  });
});
