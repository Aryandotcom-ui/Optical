import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EnvValidationError } from '@optical/config/env';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { findWorkspaceRoot, loadApiEnv, loadDotEnvFile } from '../src/config/env';
import { baseTestEnv } from './helpers';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('loadApiEnv', () => {
  it('applies documented defaults', () => {
    const env = loadApiEnv({
      DATABASE_URL: baseTestEnv.DATABASE_URL,
      REDIS_URL: baseTestEnv.REDIS_URL,
    });
    expect(env).toMatchObject({
      NODE_ENV: 'development',
      API_PORT: 4000,
      API_HOST: '0.0.0.0',
      CORS_ALLOWED_ORIGINS: ['http://localhost:3000'],
      LOG_PRETTY: true,
      API_DOCS_ENABLED: true,
    });
    expect(env.featureFlags.googleOAuth).toBe(false);
  });

  it('turns pretty logs off outside development unless asked', () => {
    expect(loadApiEnv({ ...baseTestEnv, NODE_ENV: 'production' }).LOG_PRETTY).toBe(false);
    expect(
      loadApiEnv({ ...baseTestEnv, NODE_ENV: 'production', LOG_PRETTY: 'on' }).LOG_PRETTY,
    ).toBe(true);
  });

  it('fails fast listing missing and malformed variables', () => {
    expect(() => loadApiEnv({ REDIS_URL: 'http://localhost:6379' })).toThrow(EnvValidationError);
    try {
      loadApiEnv({ REDIS_URL: 'http://localhost:6379' });
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('DATABASE_URL: is required but not set.');
      expect(message).toContain('REDIS_URL: must be a redis:// or rediss:// URL');
    }
  });

  it('reports a bad FEATURE_FLAGS value as an env problem', () => {
    expect(() => loadApiEnv({ ...baseTestEnv, FEATURE_FLAGS: 'teleport=on' })).toThrow(
      /FEATURE_FLAGS: Unknown feature flag "teleport"/,
    );
  });
});

describe('.env discovery', () => {
  it('finds the workspace root from a nested directory', () => {
    const root = mkdtempSync(join(tmpdir(), 'optical-env-'));
    writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages: []\n');
    const nested = join(root, 'apps', 'api', 'dist');
    mkdirSync(nested, { recursive: true });
    expect(findWorkspaceRoot(nested)).toBe(root);
  });

  it('returns undefined outside any workspace', () => {
    expect(findWorkspaceRoot(tmpdir())).toBeUndefined();
  });

  it('loads the file named by ENV_FILE without overriding existing variables', () => {
    const dir = mkdtempSync(join(tmpdir(), 'optical-env-'));
    const file = join(dir, '.env');
    writeFileSync(file, 'OPTICAL_TEST_FROM_FILE=file\nOPTICAL_TEST_PRESET=file\n');
    vi.stubEnv('ENV_FILE', file);
    vi.stubEnv('OPTICAL_TEST_PRESET', 'process');

    expect(loadDotEnvFile()).toBe(file);
    expect(process.env.OPTICAL_TEST_FROM_FILE).toBe('file');
    expect(process.env.OPTICAL_TEST_PRESET).toBe('process');
    delete process.env.OPTICAL_TEST_FROM_FILE;
  });

  it('does nothing when the file does not exist', () => {
    vi.stubEnv('ENV_FILE', join(tmpdir(), 'definitely-missing.env'));
    expect(loadDotEnvFile()).toBeUndefined();
  });
});
