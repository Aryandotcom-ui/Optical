import { productDetailSchema } from '@optical/shared/catalog';
import {
  lensCatalogSchema,
  lensQuoteResponseSchema,
  type LensQuoteResponse,
} from '@optical/shared/lens';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildDbTestApp } from './helpers';

type App = Awaited<ReturnType<typeof buildDbTestApp>>['app'];
let app: App;
const ids: Record<string, string> = {};

beforeAll(async () => {
  app = (await buildDbTestApp()).app;
  for (const slug of ['harbour', 'ulla', 'lens-care-kit', 'lark']) {
    ids[slug] = productDetailSchema.parse(
      (await app.inject({ method: 'GET', url: `/v1/products/${slug}` })).json(),
    ).id;
  }
});
afterAll(async () => {
  await app.close();
});

async function quote(
  productId: string,
  config: Record<string, unknown>,
): Promise<LensQuoteResponse> {
  const response = await app.inject({
    method: 'POST',
    url: '/v1/lens/quote',
    payload: { productId, config },
  });
  expect(response.statusCode, response.payload).toBe(200);
  return lensQuoteResponseSchema.parse(response.json());
}

const rx = (sph: number) => ({
  mode: 'manual',
  rx: { right: { sph }, left: { sph }, pd: { kind: 'single', value: 63 } },
});

describe('GET /v1/lens/options', () => {
  it('returns the lens catalogue from the database', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/lens/options' });
    const catalog = lensCatalogSchema.parse(response.json());
    expect(catalog.purposes.map((purpose) => purpose.code)).toEqual([
      'zero-power',
      'single-vision',
      'progressive',
      'computer',
      'sun-rx',
    ]);
    expect(catalog.indexes).toHaveLength(5);
    expect(catalog.rules.length).toBeGreaterThan(3);
  });
});

describe('POST /v1/lens/quote', () => {
  it('prices a valid configuration and recommends an index', async () => {
    const result = await quote(ids.harbour!, {
      purpose: 'single-vision',
      prescription: rx(-4.25),
      indexCode: '1.61',
      packageCode: 'complete',
    });
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.totalMinor).toBe(1_190_00 + 1_400_00 + 990_00);
    expect(result.recommendation?.indexCode).toBe('1.61');
    expect(result.thickness?.map((entry) => entry.indexCode)).toEqual([
      '1.50',
      '1.56',
      '1.61',
      '1.67',
      '1.74',
    ]);
    expect(result.availability.indexes['1.50']).toEqual({
      available: false,
      reason: expect.stringContaining('up to ±4.00') as string,
    });
  });

  it('applies frame rules: rimless frames cannot take 1.50 lenses', async () => {
    const result = await quote(ids.ulla!, {
      purpose: 'single-vision',
      prescription: rx(-1),
      indexCode: '1.50',
    });
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.errors[0]).toMatchObject({ path: 'indexCode', code: 'unavailable' });
    expect(result.availability.indexes['1.61']?.available).toBe(true);
  });

  it('blocks progressive lenses on shallow frames', async () => {
    const result = await quote(ids.lark!, {
      purpose: 'progressive',
      prescription: { mode: 'later' },
      indexCode: '1.56',
    });
    expect(result.valid).toBe(false);
    expect(result.availability.purposes.progressive).toEqual({
      available: false,
      reason: expect.stringContaining('28 mm') as string,
    });
  });

  it('returns availability even when the configuration is incomplete', async () => {
    const result = await quote(ids.harbour!, { purpose: 'single-vision' });
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.errors.map((error) => error.code)).toEqual([
      'prescription-required',
      'index-required',
    ]);
    expect(Object.keys(result.availability.tints)).toContain('photochromic');
  });

  it('refuses lenses for accessories and unknown products', async () => {
    const accessory = await app.inject({
      method: 'POST',
      url: '/v1/lens/quote',
      payload: { productId: ids['lens-care-kit'], config: { purpose: 'zero-power' } },
    });
    expect(accessory.statusCode).toBe(422);
    const unknown = await app.inject({
      method: 'POST',
      url: '/v1/lens/quote',
      payload: {
        productId: '0192f4c8-0000-7000-8000-000000000000',
        config: { purpose: 'zero-power' },
      },
    });
    expect(unknown.statusCode).toBe(404);
  });

  it('validates the request body', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/lens/quote',
      payload: { productId: 'not-a-uuid', config: { purpose: 'x-ray' } },
    });
    expect(response.statusCode).toBe(422);
  });
});
