import { isApiErrorBody, type ApiErrorBody } from '@optical/shared/api';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AppError } from '../src/lib/app-error';
import { buildTestApp } from './helpers';

type TestApp = Awaited<ReturnType<typeof buildTestApp>>['app'];
let app: TestApp;

beforeEach(async () => {
  app = (await buildTestApp()).app;
  app.post(
    '/test/echo',
    { schema: { body: z.object({ email: z.email(), quantity: z.number().int().min(1) }) } },
    (request) => request.body,
  );
  app.get('/test/app-error', () => {
    throw new AppError('CONFLICT', 'That coupon has already been used.');
  });
  app.get('/test/crash', () => {
    throw new Error('database password is hunter2');
  });
});

afterEach(async () => {
  await app.close();
});

function errorBody(payload: string): ApiErrorBody['error'] {
  const body: unknown = JSON.parse(payload);
  expect(isApiErrorBody(body)).toBe(true);
  return (body as ApiErrorBody).error;
}

describe('request IDs', () => {
  it('mints a UUID when the caller sends none', async () => {
    const response = await app.inject({ method: 'GET', url: '/healthz' });
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('propagates a safe upstream ID', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/healthz',
      headers: { 'x-request-id': 'web-1234567890' },
    });
    expect(response.headers['x-request-id']).toBe('web-1234567890');
  });

  it('replaces an unsafe upstream ID', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/healthz',
      headers: { 'x-request-id': 'bad id\nwith newline' },
    });
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('error envelope', () => {
  it('returns 404 NOT_FOUND for unknown routes, with the request ID', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/nope',
      headers: { 'x-request-id': 'trace-abcdefgh' },
    });
    expect(response.statusCode).toBe(404);
    expect(errorBody(response.payload)).toMatchObject({
      code: 'NOT_FOUND',
      requestId: 'trace-abcdefgh',
    });
  });

  it('returns 422 VALIDATION_FAILED with a detail per invalid field', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/test/echo',
      payload: { email: 'not-an-email', quantity: 0 },
    });
    expect(response.statusCode).toBe(422);
    const error = errorBody(response.payload);
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.details?.map((detail) => detail.path).sort()).toEqual([
      'body.email',
      'body.quantity',
    ]);
  });

  it('passes valid bodies through', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/test/echo',
      payload: { email: 'asha@example.com', quantity: 2 },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ email: 'asha@example.com', quantity: 2 });
  });

  it('returns 400 BAD_REQUEST for malformed JSON', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/test/echo',
      headers: { 'content-type': 'application/json' },
      payload: '{"email":',
    });
    expect(response.statusCode).toBe(400);
    expect(errorBody(response.payload).code).toBe('BAD_REQUEST');
  });

  it('returns 415 for unsupported content types', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/test/echo',
      headers: { 'content-type': 'application/xml' },
      payload: '<a/>',
    });
    expect(response.statusCode).toBe(415);
    expect(errorBody(response.payload).code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('maps AppError to its code and status', async () => {
    const response = await app.inject({ method: 'GET', url: '/test/app-error' });
    expect(response.statusCode).toBe(409);
    expect(errorBody(response.payload)).toMatchObject({
      code: 'CONFLICT',
      message: 'That coupon has already been used.',
    });
  });

  it('hides internal error details behind INTERNAL_ERROR', async () => {
    const response = await app.inject({ method: 'GET', url: '/test/crash' });
    expect(response.statusCode).toBe(500);
    const error = errorBody(response.payload);
    expect(error.code).toBe('INTERNAL_ERROR');
    expect(response.payload).not.toContain('hunter2');
  });
});

describe('security headers and CORS', () => {
  it('sets hardened headers on JSON responses', async () => {
    const response = await app.inject({ method: 'GET', url: '/healthz' });
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['content-security-policy']).toContain("default-src 'none'");
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('allows credentialed requests from allow-listed origins', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/healthz',
      headers: { origin: 'http://localhost:3000' },
    });
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('does not grant CORS to other origins', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/healthz',
      headers: { origin: 'https://evil.example' },
    });
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('OpenAPI docs', () => {
  it('serves the generated document with the system routes', async () => {
    const response = await app.inject({ method: 'GET', url: '/docs/json' });
    expect(response.statusCode).toBe(200);
    const document = response.json<{ openapi: string; paths: Record<string, unknown> }>();
    expect(document.openapi).toBe('3.1.0');
    expect(Object.keys(document.paths)).toEqual(expect.arrayContaining(['/healthz', '/readyz']));
  });

  it('serves the interactive docs UI', async () => {
    const response = await app.inject({ method: 'GET', url: '/docs' });
    expect([200, 302]).toContain(response.statusCode);
  });

  it('can be switched off', async () => {
    const hidden = (await buildTestApp({ env: { API_DOCS_ENABLED: 'false' } })).app;
    const response = await hidden.inject({ method: 'GET', url: '/docs' });
    expect(response.statusCode).toBe(404);
    await hidden.close();
  });
});
