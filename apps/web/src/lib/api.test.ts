import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('server-only', () => ({}));

const { apiRequest } = await import('./api');

const schema = z.object({ status: z.literal('ok') });
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubEnv('API_INTERNAL_URL', 'http://api.internal:4000');
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  fetchMock.mockReset();
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('apiRequest', () => {
  it('parses successful responses and forwards a request ID', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'ok' }));
    const result = await apiRequest('/healthz', schema, { requestId: 'web-test-0001' });

    expect(result).toEqual({
      ok: true,
      status: 200,
      data: { status: 'ok' },
      requestId: 'web-test-0001',
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://api.internal:4000/healthz');
    const headers = new Headers(init?.headers);
    expect(headers.get('x-request-id')).toBe('web-test-0001');
    expect(headers.get('accept')).toBe('application/json');
  });

  it('mints a request ID when none is given', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'ok' }));
    const result = await apiRequest('/healthz', schema);
    expect(result.requestId).toMatch(/^web-[0-9a-f-]{36}$/);
  });

  it('reports network failures as unreachable instead of throwing', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    const result = await apiRequest('/healthz', schema);
    expect(result).toMatchObject({ ok: false, kind: 'unreachable', message: 'fetch failed' });
  });

  it('returns the API error envelope for error statuses', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { error: { code: 'NOT_FOUND', message: 'No such frame.', requestId: 'r-12345678' } },
        404,
      ),
    );
    const result = await apiRequest('/v1/products/nope', schema);
    expect(result).toMatchObject({
      ok: false,
      kind: 'error',
      status: 404,
      error: { code: 'NOT_FOUND' },
    });
  });

  it('parses accepted non-2xx statuses with the schema', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'ok' }, 503));
    const result = await apiRequest('/readyz', schema, { acceptStatuses: [200, 503] });
    expect(result).toMatchObject({ ok: true, status: 503 });
  });

  it('flags bodies that do not match the schema', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'maybe' }));
    expect(await apiRequest('/healthz', schema)).toMatchObject({
      ok: false,
      kind: 'invalid-response',
    });
  });

  it('flags error statuses without an envelope', async () => {
    fetchMock.mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 }));
    expect(await apiRequest('/healthz', schema)).toMatchObject({
      ok: false,
      kind: 'invalid-response',
      status: 502,
      message: 'Unexpected 502 response.',
    });
  });
});
