import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { finderAnswersSchema } from './schemas';
import {
  emptyFinderAnswers,
  rankFrames,
  scoreFrame,
  type FinderAnswers,
  type FinderCandidate,
} from './index';

const frame = (overrides: Partial<FinderCandidate> & { id: string }): FinderCandidate => ({
  category: 'eyeglasses',
  material: 'acetate',
  priceMinor: 2_990_00,
  totalWidthMm: 138,
  styleTags: ['classic'],
  faceShapes: [{ faceShape: 'round', score: 0.9 }],
  colourFamilies: ['black'],
  rating: 4.2,
  ...overrides,
});

const answers = (overrides: Partial<FinderAnswers>): FinderAnswers => ({
  ...emptyFinderAnswers,
  ...overrides,
});

describe('frame finder scoring', () => {
  it('gives full marks and reasons when every answer matches', () => {
    const scored = scoreFrame(
      frame({ id: 'a' }),
      answers({
        faceShape: 'round',
        faceWidthMm: 142,
        vibes: ['classic'],
        use: 'everyday',
        budget: 'mid',
        materials: ['acetate'],
        colours: ['black'],
      }),
    );
    expect(scored.score).toBeGreaterThanOrEqual(90);
    expect(scored.reasons[0]).toEqual({ criterion: 'shape', faceShape: 'round' });
    expect(scored.reasons).toHaveLength(3);
  });

  it('ignores skipped questions instead of penalising', () => {
    const scored = scoreFrame(frame({ id: 'a' }), answers({ faceShape: 'round' }));
    expect(scored.parts).toEqual({ shape: 0.9 });
    expect(scored.score).toBe(90);
    expect(scoreFrame(frame({ id: 'a' }), emptyFinderAnswers)).toMatchObject({
      score: 0,
      reasons: [],
    });
  });

  it('ranks the better match first and breaks ties by rating, then id', () => {
    const list = [
      frame({ id: 'b', faceShapes: [{ faceShape: 'round', score: 0.4 }] }),
      frame({ id: 'a', rating: 4 }),
      frame({ id: 'c', rating: 4.8 }),
      frame({ id: 'd', rating: 4.8 }),
    ];
    expect(rankFrames(list, answers({ faceShape: 'round' })).map((entry) => entry.id)).toEqual([
      'c',
      'd',
      'a',
      'b',
    ]);
    expect(rankFrames(list, emptyFinderAnswers, 2).map((entry) => entry.id)).toEqual(['c', 'd']);
  });

  it('scores price bands softly just outside and not at all far outside', () => {
    const inBand = scoreFrame(frame({ id: 'a', priceMinor: 3_000_00 }), answers({ budget: 'mid' }));
    const near = scoreFrame(frame({ id: 'b', priceMinor: 4_200_00 }), answers({ budget: 'mid' }));
    const far = scoreFrame(frame({ id: 'c', priceMinor: 7_990_00 }), answers({ budget: 'mid' }));
    const premium = scoreFrame(
      frame({ id: 'd', priceMinor: 9_000_00 }),
      answers({ budget: 'premium' }),
    );
    const below = scoreFrame(frame({ id: 'e', priceMinor: 2_000_00 }), answers({ budget: 'mid' }));
    expect(inBand.parts.budget).toBe(1);
    expect(near.parts.budget).toBeGreaterThan(0);
    expect(near.parts.budget).toBeLessThan(1);
    expect(far.parts.budget).toBe(0);
    expect(premium.parts.budget).toBe(1);
    expect(below.parts.budget).toBeGreaterThan(0);
  });

  it('matches size to the measured face width', () => {
    const fits = scoreFrame(frame({ id: 'a', totalWidthMm: 136 }), answers({ faceWidthMm: 140 }));
    const wide = scoreFrame(frame({ id: 'b', totalWidthMm: 160 }), answers({ faceWidthMm: 130 }));
    const unknown = scoreFrame(
      frame({ id: 'c', totalWidthMm: null }),
      answers({ faceWidthMm: 140 }),
    );
    expect(fits.parts.size).toBe(1);
    expect(fits.reasons).toContainEqual({ criterion: 'size', fit: 'good' });
    expect(wide.parts.size).toBe(0);
    expect(unknown.parts.size).toBeUndefined();
  });

  it('weighs use, style, material and colour', () => {
    const sun = frame({ id: 'a', category: 'sunglasses', styleTags: ['bold'] });
    expect(scoreFrame(sun, answers({ use: 'outdoors' })).parts.use).toBe(1);
    expect(
      scoreFrame(frame({ id: 'b', styleTags: ['durable'] }), answers({ use: 'active' })).parts.use,
    ).toBe(0.7);
    expect(scoreFrame(frame({ id: 'c' }), answers({ use: 'screens' })).parts.use).toBe(0.3);
    expect(scoreFrame(sun, answers({ vibes: ['minimal'] })).parts.style).toBe(0);
    expect(scoreFrame(sun, answers({ vibes: ['bold'] })).reasons).toEqual([
      { criterion: 'style', tags: ['bold'] },
    ]);
    expect(
      scoreFrame(frame({ id: 'd', material: null }), answers({ materials: ['metal'] })).parts
        .material,
    ).toBe(0);
    expect(scoreFrame(frame({ id: 'e' }), answers({ colours: ['blue'] })).parts.colour).toBe(0);
  });

  it('always scores between 0 and 100 and is deterministic', () => {
    const candidate = fc.record({
      id: fc.uuid(),
      category: fc.constantFrom('eyeglasses', 'sunglasses', 'computer-glasses', 'kids'),
      material: fc.constantFrom('acetate', 'metal', 'titanium', 'tr90', 'mixed', null),
      priceMinor: fc.integer({ min: 0, max: 20_000_00 }),
      totalWidthMm: fc.option(fc.integer({ min: 110, max: 160 }), { nil: null }),
      styleTags: fc.subarray(['classic', 'retro', 'bold', 'minimal', 'outdoor', 'screen']),
      faceShapes: fc.constant([{ faceShape: 'oval' as const, score: 0.8 }]),
      colourFamilies: fc.subarray(['black', 'blue', 'gold'] as const),
      rating: fc.double({ min: 0, max: 5, noNaN: true }),
    }) as fc.Arbitrary<FinderCandidate>;
    const answer = fc.record({
      faceShape: fc.constantFrom('oval', 'round', null),
      faceWidthMm: fc.option(fc.integer({ min: 110, max: 170 }), { nil: null }),
      vibes: fc.subarray(['classic', 'minimal', 'retro', 'bold'] as const),
      use: fc.constantFrom('everyday', 'screens', 'outdoors', 'active', null),
      budget: fc.constantFrom('value', 'mid', 'premium', null),
      materials: fc.subarray(['acetate', 'metal'] as const),
      colours: fc.subarray(['black', 'gold'] as const),
    }) as fc.Arbitrary<FinderAnswers>;
    fc.assert(
      fc.property(candidate, answer, (c, a) => {
        const first = scoreFrame(c, a);
        expect(first.score).toBeGreaterThanOrEqual(0);
        expect(first.score).toBeLessThanOrEqual(100);
        expect(scoreFrame(c, a)).toEqual(first);
      }),
    );
  });

  it('validates answers at the API boundary with defaults for skipped steps', () => {
    expect(finderAnswersSchema.parse({})).toEqual(emptyFinderAnswers);
    expect(() => finderAnswersSchema.parse({ vibes: ['grunge'] })).toThrow();
  });
});
