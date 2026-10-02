import type { App } from '../src/app';
import type { Db } from '../src/infra/prisma';

export const STORE_ORIGIN = 'http://localhost:3000';

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

/**
 * A pretend browser for API tests: remembers the session cookie the API
 * sets and sends the storefront's Origin, like the real web app.
 */
export class TestBrowser {
  cookie: string | null = null;

  constructor(private readonly app: App) {}

  async request(
    method: Method,
    url: string,
    options: { body?: unknown; headers?: Record<string, string>; origin?: string | null } = {},
  ) {
    const headers: Record<string, string> = { ...options.headers };
    if (this.cookie) headers.cookie = this.cookie;
    if (options.origin !== null) headers.origin = options.origin ?? STORE_ORIGIN;
    const response = await this.app.inject({
      method,
      url,
      headers,
      ...(options.body === undefined ? {} : { payload: options.body as object }),
    });
    const setCookie = response.cookies.find((cookie) => cookie.name === 'lo_session');
    if (setCookie) this.cookie = `lo_session=${setCookie.value}`;
    return response;
  }

  get(url: string, headers?: Record<string, string>) {
    return this.request('GET', url, headers ? { headers } : {});
  }

  post(url: string, body?: unknown, headers?: Record<string, string>) {
    return this.request('POST', url, { body: body ?? {}, ...(headers ? { headers } : {}) });
  }
}

/** A variant id of a seeded product with plenty of stock. */
export async function stockedVariant(
  db: Db,
  slug: string,
): Promise<{ id: string; productId: string; priceMinor: number; onHand: number }> {
  const variant = await db.productVariant.findFirstOrThrow({
    where: { product: { slug }, isActive: true },
    orderBy: { stock: { onHand: 'desc' } },
    include: { product: true, stock: true },
  });
  return {
    id: variant.id,
    productId: variant.productId,
    priceMinor: variant.priceOverrideMinor ?? variant.product.basePriceMinor,
    onHand: variant.stock?.onHand ?? 0,
  };
}

export const deliveryAddress = {
  fullName: 'Asha Kulkarni',
  line1: '14, 2nd Cross, Indiranagar',
  city: 'Bengaluru',
  region: 'Karnataka',
  postalCode: '560038',
};
