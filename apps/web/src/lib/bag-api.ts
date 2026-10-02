import type { ApiErrorBody } from '@optical/shared/api';
import type { AddCartItem, Cart } from '@optical/shared/checkout';
import { bagCount } from '@/stores/bag';

/**
 * The browser's calls to the shop API, starting with the bag. Product pages
 * import only this module (adding to the bag); checkout and order pages
 * add `commerce-api`. They send the guest session cookie and trust our own
 * API's typed contracts rather than re-validating (no Zod in client bundles).
 */
const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/+$/, '');

export class CommerceError extends Error {
  override name = 'CommerceError';
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: { path: string; message: string }[] = [],
  ) {
    super(message);
  }

  /** The message for one field, e.g. "address.postalCode". */
  field(path: string): string | undefined {
    return this.details.find((detail) => detail.path === path || detail.path.endsWith(`.${path}`))
      ?.message;
  }
}

const OFFLINE_MESSAGE =
  "We couldn't reach the shop. Check your connection and try again; nothing has been lost.";

export async function call<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  options: { body?: unknown; headers?: Record<string, string>; form?: FormData } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      credentials: 'include',
      headers: {
        accept: 'application/json',
        ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...options.headers,
      },
      body: options.form ?? (options.body === undefined ? undefined : JSON.stringify(options.body)),
    });
  } catch {
    throw new CommerceError(0, 'OFFLINE', OFFLINE_MESSAGE);
  }
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const error = (body as Partial<ApiErrorBody> | null)?.error;
    throw new CommerceError(
      response.status,
      error?.code ?? 'UNKNOWN',
      error?.message ?? 'Something went wrong. Please try again.',
      error?.details ?? [],
    );
  }
  return body as T;
}

/** Every bag response updates the count in the header. */
export async function bag(request: Promise<Cart>): Promise<Cart> {
  const cart = await request;
  bagCount.set(cart.itemCount);
  return cart;
}

export const fetchCart = () => bag(call<Cart>('GET', '/v1/cart'));
export const addToCart = (item: AddCartItem) =>
  bag(call<Cart>('POST', '/v1/cart/items', { body: item }));
