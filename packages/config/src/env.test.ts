import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { EnvValidationError, envField, parseEnv } from './env';

const schema = z.object({
  PORT: envField.port(4000),
  PUBLIC_URL: envField.httpUrl(),
  ORIGINS: envField.list().default([]),
  SECURE: envField.boolean().default(false),
  SECRET: envField.secret(8),
});

const valid = { PUBLIC_URL: 'http://localhost:3000/', SECRET: 'abcdefgh' };

describe('parseEnv', () => {
  it('applies defaults and transforms', () => {
    const env = parseEnv('test', schema, valid);
    expect(env).toEqual({
      PORT: 4000,
      PUBLIC_URL: 'http://localhost:3000',
      ORIGINS: [],
      SECURE: false,
      SECRET: 'abcdefgh',
    });
  });

  it('coerces strings from the environment', () => {
    const env = parseEnv('test', schema, {
      ...valid,
      PORT: '8080',
      ORIGINS: 'https://a.example, ,https://b.example',
      SECURE: 'on',
    });
    expect(env.PORT).toBe(8080);
    expect(env.ORIGINS).toEqual(['https://a.example', 'https://b.example']);
    expect(env.SECURE).toBe(true);
  });

  it('treats empty strings as unset so defaults apply', () => {
    expect(parseEnv('test', schema, { ...valid, PORT: '' }).PORT).toBe(4000);
  });

  it('reports every problem at once with the app name', () => {
    let error: unknown;
    try {
      parseEnv('api', schema, { PORT: '99999', PUBLIC_URL: 'ftp://nope', SECURE: 'perhaps' });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(EnvValidationError);
    const envError = error as EnvValidationError;
    expect(envError.message).toContain('Invalid environment for api');
    expect(envError.problems).toHaveLength(4);
    expect(envError.message).toContain('SECRET: is required but not set.');
    expect(envError.message).toMatch(/PUBLIC_URL: must be an http/);
    expect(envError.message).toContain('.env.example');
  });
});
