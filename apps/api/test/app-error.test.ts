import { describe, expect, it } from 'vitest';
import { AppError } from '../src/lib/app-error';
import { buildTestApp } from './helpers';

describe('AppError', () => {
  it('derives the HTTP status from the code', () => {
    expect(new AppError('RATE_LIMITED', 'Slow down.').statusCode).toBe(429);
    expect(new AppError('SERVICE_UNAVAILABLE', 'Down.').statusCode).toBe(503);
  });

  it('has a customer-safe default for not found', () => {
    const error = AppError.notFound();
    expect(error).toMatchObject({ code: 'NOT_FOUND', statusCode: 404 });
    expect(error.message).toMatch(/could not find/);
  });

  it('returns 5xx AppErrors with their own safe message', async () => {
    const { app } = await buildTestApp();
    app.get('/test/unavailable', () => {
      throw new AppError('SERVICE_UNAVAILABLE', 'Payments are paused for maintenance.');
    });
    const response = await app.inject({ method: 'GET', url: '/test/unavailable' });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      error: { code: 'SERVICE_UNAVAILABLE', message: 'Payments are paused for maintenance.' },
    });
    await app.close();
  });
});
