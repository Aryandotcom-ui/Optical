import { defaultLensCatalog } from '@optical/shared/lens';
import { describe, expect, it } from 'vitest';
import {
  defaultDraft,
  draftPrescription,
  emptyDraft,
  evaluateDraft,
  recommendedIndex,
  stepComplete,
  stepsFor,
  toLensConfig,
  type LensDraft,
} from './lens-draft';

const catalog = defaultLensCatalog;
const frame = { rimType: 'full-rim' as const, lensHeightMm: 42, lensWidthMm: 50 };

const typed: LensDraft = {
  ...defaultDraft(catalog, 'eyeglasses'),
  rx: {
    right: { sph: -2.25, cyl: -0.5, axis: 90, add: null },
    left: { sph: -2, cyl: null, axis: null, add: null },
    pdKind: 'single',
    pd: 63,
    pdRight: null,
    pdLeft: null,
  },
  indexCode: '1.56',
  packageCode: 'complete',
};

describe('defaults', () => {
  it('starts from the usual lens for the kind of frame', () => {
    expect(defaultDraft(catalog, 'eyeglasses').purpose).toBe('single-vision');
    expect(defaultDraft(catalog, 'computer-glasses').purpose).toBe('computer');
    const sun = defaultDraft(catalog, 'sunglasses');
    expect(sun.purpose).toBe('sun-rx');
    expect(sun.tint).toEqual({ code: 'solid', colourCode: 'grey', intensity: null });
  });

  it('skips prescription and thickness for lenses without power', () => {
    expect(stepsFor({ ...emptyDraft, purpose: 'zero-power' }, catalog)).toEqual([
      'purpose',
      'coatings',
      'tint',
      'review',
    ]);
    expect(stepsFor(typed, catalog)).toHaveLength(6);
  });
});

describe('prescription entry', () => {
  it('needs a PD before the prescription is complete', () => {
    expect(draftPrescription({ ...typed.rx, pd: null })).toBeNull();
    expect(
      draftPrescription({ ...typed.rx, pdKind: 'dual', pdRight: 31.5, pdLeft: 31 })?.pd,
    ).toEqual({
      kind: 'dual',
      right: 31.5,
      left: 31,
    });
  });

  it('reports field errors and blocks the step until they are fixed', () => {
    const draft = {
      ...typed,
      rx: { ...typed.rx, right: { sph: -2, cyl: -0.5, axis: null, add: null } },
    };
    const evaluation = evaluateDraft(draft, catalog, frame);
    expect(evaluation.rxIssues.map((issue) => issue.path)).toContain('right.axis');
    expect(stepComplete('prescription', draft, evaluation)).toBe(false);
    expect(stepComplete('prescription', { ...draft, rxMode: 'later' }, evaluation)).toBe(true);
    expect(stepComplete('prescription', { ...draft, rxMode: 'upload' }, evaluation)).toBe(false);
  });
});

describe('pricing', () => {
  it('prices a complete draft with the shared engine', () => {
    const evaluation = evaluateDraft(typed, catalog, frame);
    expect(evaluation.quote?.ok).toBe(true);
    if (!evaluation.quote?.ok) return;
    expect(evaluation.quote.lines.map((line) => line.code)).toEqual([
      'single-vision',
      '1.56',
      'complete',
    ]);
    expect(evaluation.quote.totalMinor).toBe(1_190_00 + 400_00 + 990_00);
    expect(evaluation.signedPower).toBe(-2.75);
    expect(stepComplete('review', typed, evaluation)).toBe(true);
  });

  it('sends a prescription later as its own mode, and no prescription for zero power', () => {
    expect(toLensConfig({ ...typed, rxMode: 'later' }, catalog)?.prescription).toEqual({
      mode: 'later',
    });
    const zero = toLensConfig({ ...typed, purpose: 'zero-power' }, catalog);
    expect(zero).toMatchObject({ prescription: null, indexCode: '1.56' });
  });

  it('marks options the rules forbid, with the reason', () => {
    const evaluation = evaluateDraft({ ...typed, indexCode: '1.74' }, catalog, frame);
    expect(evaluation.availability.tints.polarised).toEqual({
      available: false,
      reason: 'Polarised lenses are not made in 1.74. Choose 1.67 for the thinnest polarised lens.',
    });
  });

  it('recommends a thinner material for a stronger prescription', () => {
    const strong = {
      ...typed,
      rx: { ...typed.rx, right: { sph: -6, cyl: null, axis: null, add: null } },
    };
    expect(recommendedIndex(catalog, strong, evaluateDraft(strong, catalog, frame), frame)).toBe(
      '1.67',
    );
    expect(recommendedIndex(catalog, typed, evaluateDraft(typed, catalog, frame), frame)).toBe(
      '1.61',
    );
  });
});
