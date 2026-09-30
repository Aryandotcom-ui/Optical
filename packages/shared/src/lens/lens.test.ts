import { describe, expect, it } from 'vitest';
import { prescriptionSchema, type PrescriptionInput } from '../rx/prescription';
import { availabilityOf, lensAvailability, type LensSelectionContext } from './availability';
import { lensCatalogSchema } from './catalog';
import { lensConfigSchema, type LensConfigInput, type LensFrameContext } from './config';
import { defaultLensCatalog as catalog } from './default-catalog';
import { quoteLens, type LensQuoteSuccess } from './quote';
import { recommendIndex } from './recommend';
import { estimateLensThickness } from './thickness';

const fullRim: LensFrameContext = { rimType: 'full-rim', lensHeightMm: 40, lensWidthMm: 52 };
const rimless: LensFrameContext = { rimType: 'rimless', lensHeightMm: 36, lensWidthMm: 52 };
const shallow: LensFrameContext = { rimType: 'full-rim', lensHeightMm: 26, lensWidthMm: 50 };

function ctx(overrides: Partial<LensSelectionContext> = {}): LensSelectionContext {
  return {
    purpose: 'single-vision',
    frame: fullRim,
    strongestPower: null,
    selected: [],
    ...overrides,
  };
}

function manual(
  right: PrescriptionInput['right'],
  left = right,
  extra: Partial<PrescriptionInput> = {},
) {
  return {
    mode: 'manual' as const,
    rx: prescriptionSchema.parse({ right, left, pd: { kind: 'single', value: 63 }, ...extra }),
  };
}

function quote(input: LensConfigInput, frame: LensFrameContext | null = fullRim) {
  return quoteLens(catalog, lensConfigSchema.parse(input), frame);
}

function expectOk(result: ReturnType<typeof quote>): LensQuoteSuccess {
  if (!result.ok) throw new Error(`Expected a quote, got ${JSON.stringify(result.errors)}`);
  return result;
}

describe('default catalogue', () => {
  it('matches the catalogue schema', () => {
    expect(() => lensCatalogSchema.parse(catalog)).not.toThrow();
  });

  it('only references codes that exist', () => {
    const coatingCodes = new Set(catalog.coatings.map((coating) => coating.code));
    const indexCodes = new Set(catalog.indexes.map((index) => index.code));
    const tintCodes = new Set(catalog.tints.map((tint) => tint.code));
    for (const pkg of catalog.packages)
      for (const code of pkg.coatingCodes) expect(coatingCodes).toContain(code);
    for (const purpose of catalog.purposes) {
      expect(indexCodes).toContain(purpose.defaultIndexCode);
      expect(tintCodes).toContain(purpose.defaultTintCode);
      for (const code of purpose.includedCoatingCodes) expect(coatingCodes).toContain(code);
    }
  });

  it('prices packages below the sum of their coatings', () => {
    for (const pkg of catalog.packages) {
      const separately = pkg.coatingCodes.reduce(
        (sum, code) =>
          sum + (catalog.coatings.find((coating) => coating.code === code)?.priceMinor ?? 0),
        0,
      );
      expect(pkg.priceMinor).toBeLessThan(separately);
    }
  });
});

describe('availability rules', () => {
  it('blocks low indexes on rimless frames, with a reason', () => {
    const result = availabilityOf(
      { type: 'index', code: '1.50' },
      catalog,
      ctx({ frame: rimless }),
    );
    expect(result.available).toBe(false);
    expect(result.reason).toMatch(/Rimless frames are drilled/);
    expect(
      availabilityOf({ type: 'index', code: '1.61' }, catalog, ctx({ frame: rimless })).available,
    ).toBe(true);
  });

  it('blocks indexes that are not made in the customer power', () => {
    const result = availabilityOf(
      { type: 'index', code: '1.56' },
      catalog,
      ctx({ strongestPower: 6.5 }),
    );
    expect(result).toEqual({
      available: false,
      reason: expect.stringContaining('up to ±6.00') as string,
    });
  });

  it('blocks progressive lenses on shallow frames', () => {
    const map = lensAvailability(catalog, ctx({ frame: shallow }));
    expect(map.purposes.progressive?.available).toBe(false);
    expect(map.purposes['single-vision']?.available).toBe(true);
  });

  it('applies pairwise rules in both directions', () => {
    const with174 = ctx({ selected: [{ type: 'index', code: '1.74' }] });
    expect(availabilityOf({ type: 'tint', code: 'polarised' }, catalog, with174).available).toBe(
      false,
    );

    const withPolarised = ctx({ selected: [{ type: 'tint', code: 'polarised' }] });
    expect(availabilityOf({ type: 'index', code: '1.74' }, catalog, withPolarised).available).toBe(
      false,
    );
    expect(availabilityOf({ type: 'index', code: '1.67' }, catalog, withPolarised).available).toBe(
      true,
    );
  });

  it('does not apply frame rules when there is no frame', () => {
    expect(
      availabilityOf({ type: 'index', code: '1.50' }, catalog, ctx({ frame: null })).available,
    ).toBe(true);
  });
});

describe('recommendIndex', () => {
  it.each([
    [0.75, '1.50'],
    [2, '1.56'],
    [4.25, '1.61'],
    [6.5, '1.67'],
    [9, '1.74'],
  ])('recommends the right index for power %s', (power, expected) => {
    expect(recommendIndex(catalog, ctx({ strongestPower: power }), 52)?.indexCode).toBe(expected);
  });

  it('skips indexes the frame rules out', () => {
    expect(recommendIndex(catalog, ctx({ strongestPower: 1, frame: rimless }), 52)?.indexCode).toBe(
      '1.61',
    );
  });

  it('explains the thickness saving in millimetres', () => {
    const recommendation = recommendIndex(catalog, ctx({ strongestPower: 5 }), 52);
    expect(recommendation?.reason).toMatch(
      /Extra thin 1\.67 lenses are about \d\.\d mm .* compared with \d\.\d mm for Mid-index 1\.56/,
    );
  });

  it('asks for the prescription when power is unknown', () => {
    expect(recommendIndex(catalog, ctx(), 52)?.reason).toMatch(/Add your prescription/);
  });
});

describe('estimateLensThickness', () => {
  it('makes minus lenses thickest at the edge and plus lenses at the centre', () => {
    const minus = estimateLensThickness({ power: -4, refractiveIndex: 1.5, lensWidthMm: 52 });
    expect(minus.edgeMm).toBeGreaterThan(minus.centreMm);
    const plus = estimateLensThickness({ power: 3, refractiveIndex: 1.5, lensWidthMm: 52 });
    expect(plus.centreMm).toBeGreaterThan(plus.edgeMm);
  });

  it('gets thinner as the index rises', () => {
    const thicknesses = catalog.indexes.map(
      (index) =>
        estimateLensThickness({
          power: -6,
          refractiveIndex: index.refractiveIndex,
          lensWidthMm: 54,
        }).maxMm,
    );
    expect([...thicknesses].sort((a, b) => b - a)).toEqual(thicknesses);
    expect(thicknesses[0]).toBeGreaterThan(thicknesses.at(-1)! + 2);
  });

  it('returns uniform thickness for plano lenses and rejects impossible indexes', () => {
    expect(estimateLensThickness({ power: 0, refractiveIndex: 1.5, lensWidthMm: 50 })).toEqual({
      centreMm: 2,
      edgeMm: 2,
      maxMm: 2,
    });
    expect(() => estimateLensThickness({ power: -1, refractiveIndex: 1, lensWidthMm: 50 })).toThrow(
      RangeError,
    );
  });
});

describe('quoteLens', () => {
  it('itemises a single-vision quote and totals it', () => {
    const result = expectOk(
      quote({
        purpose: 'single-vision',
        prescription: manual({ sph: -3.25, cyl: -0.5, axis: 90 }),
        indexCode: '1.61',
        packageCode: 'complete',
        extraCoatingCodes: ['blue-light'],
      }),
    );
    expect(result.lines.map((line) => [line.kind, line.priceMinor])).toEqual([
      ['base', 1_190_00],
      ['index', 1_400_00],
      ['package', 990_00],
      ['coating', 690_00],
    ]);
    expect(result.totalMinor).toBe(4_270_00);
    expect(result.recommendation?.indexCode).toBe('1.61');
    expect(result.thickness).toHaveLength(5);
    expect(result.config.tint).toEqual({ code: 'clear', colourCode: null, intensity: null });
  });

  it('prices zero-power lenses at nothing and ignores index and prescription', () => {
    const result = expectOk(
      quote({ purpose: 'zero-power', indexCode: '1.74', prescription: { mode: 'later' } }),
    );
    expect(result.totalMinor).toBe(0);
    expect(result.config).toMatchObject({ indexCode: '1.56', prescription: null });
    expect(result.recommendation).toBeNull();
  });

  it('drops coatings already included by the lens type or package', () => {
    const result = expectOk(
      quote({
        purpose: 'computer',
        packageCode: 'essential',
        extraCoatingCodes: ['blue-light', 'uv400', 'hydrophobic', 'hydrophobic'],
      }),
    );
    expect(result.config.extraCoatingCodes).toEqual(['hydrophobic']);
    expect(result.totalMinor).toBe(990_00 + 390_00 + 390_00);
  });

  it('accepts a prescription sent later, without thickness data', () => {
    const result = expectOk(
      quote({ purpose: 'single-vision', prescription: { mode: 'later' }, indexCode: '1.56' }),
    );
    expect(result.thickness).toBeNull();
    expect(result.recommendation?.reason).toMatch(/Add your prescription/);
  });

  it('requires a prescription and an index for prescription lenses', () => {
    const result = quote({ purpose: 'single-vision' });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.errors.map((error) => error.code)).toEqual([
        'prescription-required',
        'index-required',
      ]);
  });

  it('reports prescription errors against their fields and passes warnings through', () => {
    const invalid = quote({
      purpose: 'single-vision',
      indexCode: '1.56',
      prescription: manual({ sph: -1, cyl: -1 }),
    });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok)
      expect(invalid.errors[0]).toMatchObject({
        path: 'prescription.rx.right.axis',
        code: 'prescription-invalid',
      });

    const warned = expectOk(
      quote({
        purpose: 'single-vision',
        indexCode: '1.56',
        prescription: manual({ sph: -1, add: 2 }),
      }),
    );
    expect(warned.warnings.length).toBeGreaterThan(0);
  });

  it('rejects options blocked by rules', () => {
    const result = quote(
      { purpose: 'single-vision', prescription: manual({ sph: -1 }), indexCode: '1.50' },
      rimless,
    );
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.errors[0]).toMatchObject({ path: 'indexCode', code: 'unavailable' });
  });

  it('rejects an index that is not made in the power', () => {
    const result = quote({
      purpose: 'single-vision',
      prescription: manual({ sph: -9 }),
      indexCode: '1.61',
    });
    expect(result.ok).toBe(false);
  });

  it('requires a tint for prescription sunglasses and validates colour and strength', () => {
    const clear = quote({
      purpose: 'sun-rx',
      prescription: { mode: 'later' },
      indexCode: '1.50',
      tint: { code: 'clear' },
    });
    expect(clear.ok).toBe(false);

    const missingColour = quote({
      purpose: 'sun-rx',
      prescription: { mode: 'later' },
      indexCode: '1.50',
    });
    expect(missingColour.ok).toBe(false);
    if (!missingColour.ok) expect(missingColour.errors[0]?.code).toBe('invalid-tint-colour');

    const tooStrong = quote({
      purpose: 'sun-rx',
      prescription: { mode: 'later' },
      indexCode: '1.50',
      tint: { code: 'solid', colourCode: 'grey', intensity: 95 },
    });
    expect(tooStrong.ok).toBe(false);

    const good = expectOk(
      quote({
        purpose: 'sun-rx',
        prescription: { mode: 'later' },
        indexCode: '1.50',
        tint: { code: 'solid', colourCode: 'grey' },
      }),
    );
    expect(good.config.tint?.intensity).toBe(60);
    expect(good.totalMinor).toBe(1_790_00 + 690_00);
  });

  it('rejects colours and strengths on tints that have none', () => {
    const colour = quote({ purpose: 'zero-power', tint: { code: 'clear', colourCode: 'grey' } });
    const strength = quote({
      purpose: 'zero-power',
      tint: { code: 'polarised', colourCode: 'grey', intensity: 50 },
    });
    expect(colour.ok).toBe(false);
    expect(strength.ok).toBe(false);
  });

  it('rejects unknown codes', () => {
    const result = quote({
      purpose: 'zero-power',
      packageCode: 'gold',
      extraCoatingCodes: ['mirror'],
      tint: { code: 'rainbow' },
    });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.errors.map((error) => error.path)).toEqual([
        'packageCode',
        'extraCoatingCodes.0',
        'tint.code',
      ]);
  });

  it('rejects progressive lenses on shallow frames', () => {
    const result = quote(
      { purpose: 'progressive', prescription: manual({ sph: 1, add: 2 }), indexCode: '1.56' },
      shallow,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]?.path).toBe('purpose');
  });
});
