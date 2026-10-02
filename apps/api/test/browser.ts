import type { App } from '../src/app';
import type { Db } from '../src/infra/prisma';

export const STORE_ORIGIN = 'http://localhost:3000';

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

interface StoredCookie {
  value: string;
  path: string;
}

/**
 * A pretend browser for API tests: keeps the cookies the API sets (honouring
 * their paths and deletions) and sends the storefront's Origin, like the
 * real web app.
 */
export class TestBrowser {
  readonly jar = new Map<string, StoredCookie>();

  constructor(private readonly app: App) {}

  /** The guest session cookie, as a Cookie header value (or null). */
  get cookie(): string | null {
    const session = this.jar.get('lo_session');
    return session ? `lo_session=${session.value}` : null;
  }

  set cookie(header: string | null) {
    this.jar.clear();
    for (const part of header?.split(';') ?? []) {
      const [name, ...value] = part.trim().split('=');
      if (name) this.jar.set(name, { value: value.join('='), path: '/' });
    }
  }

  cookieHeader(url: string): string | undefined {
    const path = url.split('?')[0] ?? url;
    const pairs = [...this.jar]
      .filter(([, cookie]) => path.startsWith(cookie.path))
      .map(([name, cookie]) => `${name}=${cookie.value}`);
    return pairs.length ? pairs.join('; ') : undefined;
  }

  async request(
    method: Method,
    url: string,
    options: { body?: unknown; headers?: Record<string, string>; origin?: string | null } = {},
  ) {
    const headers: Record<string, string> = { ...options.headers };
    const cookie = this.cookieHeader(url);
    if (cookie && !headers.cookie) headers.cookie = cookie;
    if (options.origin !== null) headers.origin = options.origin ?? STORE_ORIGIN;
    const response = await this.app.inject({
      method,
      url,
      headers,
      ...(options.body === undefined ? {} : { payload: options.body as object }),
    });
    for (const set of response.cookies as {
      name: string;
      value: string;
      path?: string;
      maxAge?: number;
      expires?: Date;
    }[]) {
      const expired =
        set.maxAge === 0 || (set.expires !== undefined && set.expires.getTime() <= Date.now());
      if (expired || set.value === '') this.jar.delete(set.name);
      else this.jar.set(set.name, { value: set.value, path: set.path ?? '/' });
    }
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
