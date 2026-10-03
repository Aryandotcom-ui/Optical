import { describe, expect, it } from 'vitest';
import { apiErrorCodes, apiErrorStatus, isApiErrorBody } from './errors';

describe('API error contract', () => {
  it('maps every code to a 4xx or 5xx status', () => {
    for (const code of apiErrorCodes) {
      expect(apiErrorStatus[code]).toBeGreaterThanOrEqual(400);
      expect(apiErrorStatus[code]).toBeLessThan(600);
    }
  });

  it('recognises well-formed error bodies', () => {
    expect(
      isApiErrorBody({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Some fields need attention.',
          details: [{ path: 'email', message: 'Enter a valid email address.' }],
          requestId: 'req-1',
        },
      }),
    ).toBe(true);
  });

  it('rejects bodies with unknown codes or missing request ids', () => {
    expect(isApiErrorBody({ error: { code: 'TEAPOT', message: 'x', requestId: 'r' } })).toBe(false);
    expect(isApiErrorBody({ error: { code: 'NOT_FOUND', message: 'x' } })).toBe(false);
    expect(isApiErrorBody(null)).toBe(false);
  });
});
