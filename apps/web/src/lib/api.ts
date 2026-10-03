import 'server-only';
import { randomUUID } from 'node:crypto';
import { isApiErrorBody, type ApiErrorBody } from '@optical/shared/api';
import type { z } from 'zod';
import { getEnv } from '@/env';

export type ApiResult<T> =
  | { ok: true; status: number; data: T; requestId: string }
  | { ok: false; kind: 'unreachable'; message: string; requestId: string }
  | { ok: false; kind: 'error'; status: number; error: ApiErrorBody['error']; requestId: string }
  | { ok: false; kind: 'invalid-response'; status: number; message: string; requestId: string };

export interface ApiRequestOptions {
  /** Response status codes whose body should be parsed with `schema` (default: 2xx only). */
  acceptStatuses?: number[];
  timeoutMs?: number;
  requestId?: string;
  /**
   * Cache the response in the Next.js data cache for this many seconds,
   * tagged for on-demand revalidation. Omit for no caching.
   */
  revalidate?: number;
  tags?: string[];
  init?: RequestInit;
}

/**
 * Server-side call to the API. Never throws: every outcome, including a
 * network failure or an unexpected body, comes back as a typed result.
 * Sends an `x-request-id` so the call can be traced through API logs.
 */
export async function apiRequest<TSchema extends z.ZodType>(
  path: `/${string}`,
  schema: TSchema,
  options: ApiRequestOptions = {},
): Promise<ApiResult<z.infer<TSchema>>> {
  const requestId = options.requestId ?? `web-${randomUUID()}`;
  const url = `${getEnv().API_INTERNAL_URL}${path}`;

  const headers = new Headers(options.init?.headers);
  headers.set('accept', 'application/json');
  headers.set('x-request-id', requestId);

  let response: Response;
  try {
    response = await fetch(url, {
      ...options.init,
      headers,
      signal: AbortSignal.timeout(options.timeoutMs ?? 3_000),
      ...(options.revalidate === undefined
        ? { cache: 'no-store' as const }
        : { next: { revalidate: options.revalidate, tags: options.tags ?? [] } }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Network error';
    return { ok: false, kind: 'unreachable', message, requestId };
  }

  const body: unknown = await response.json().catch(() => undefined);
  const accepted = options.acceptStatuses?.includes(response.status) ?? response.ok;

  if (accepted) {
    const parsed = schema.safeParse(body);
    if (parsed.success) return { ok: true, status: response.status, data: parsed.data, requestId };
    return {
      ok: false,
      kind: 'invalid-response',
      status: response.status,
      message: 'The API response did not match the expected shape.',
      requestId,
    };
  }

  if (isApiErrorBody(body)) {
    return { ok: false, kind: 'error', status: response.status, error: body.error, requestId };
  }
  return {
    ok: false,
    kind: 'invalid-response',
    status: response.status,
    message: `Unexpected ${response.status} response.`,
    requestId,
  };
}
