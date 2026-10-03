import { emptyFinderAnswers } from '@optical/shared/frame-finder';
import { describe, expect, it } from 'vitest';
import {
  answeredCount,
  finderHref,
  parseFinderParams,
  toggleAnswer,
  withoutStep,
} from './finder-params';

describe('parseFinderParams', () => {
  it('reads repeated keys from a submitted form and comma lists from links', () => {
    const { answers } = parseFinderParams({
      face: 'heart',
      vibe: ['retro', 'classic'],
      material: 'titanium,acetate',
      colour: 'black',
    });
    expect(answers.faceShape).toBe('heart');
    // Normalised to the canonical order, whatever order the URL used.
    expect(answers.vibes).toEqual(['classic', 'retro']);
    expect(answers.materials).toEqual(['acetate', 'titanium']);
    expect(answers.colours).toEqual(['black']);
  });

  it('drops unknown or out-of-range values instead of failing', () => {
    const view = parseFinderParams({
      face: 'triangle',
      width: '12',
      vibe: 'goth',
      use: 'swimming',
      budget: 'cheap',
      step: '9',
    });
    expect(view.answers).toEqual(emptyFinderAnswers);
    expect(view.step).toBe(0);
    expect(view.results).toBe(false);
  });

  it('reads the step (1-based in the URL) and the results view', () => {
    expect(parseFinderParams({ step: '3' }).step).toBe(2);
    expect(parseFinderParams({ view: 'results' }).results).toBe(true);
    expect(parseFinderParams({ width: '141.6' }).answers.faceWidthMm).toBe(142);
  });
});

describe('finderHref', () => {
  it('round-trips answers through the URL', () => {
    const answers = {
      ...emptyFinderAnswers,
      faceShape: 'round' as const,
      faceWidthMm: 138,
      vibes: ['minimal' as const],
      use: 'screens' as const,
      budget: 'mid' as const,
      colours: ['clear' as const, 'black' as const],
    };
    const href = finderHref(answers);
    expect(href).toBe(
      '/frame-finder?face=round&width=138&vibe=minimal&use=screens&budget=mid&colour=clear%2Cblack&view=results',
    );
    const params = Object.fromEntries(new URL(href, 'http://x').searchParams);
    const parsed = parseFinderParams(params).answers;
    expect(parsed).toEqual({ ...answers, colours: ['black', 'clear'] });
  });

  it('links to a step, 1-based', () => {
    expect(finderHref(emptyFinderAnswers, { step: 0 })).toBe('/frame-finder?step=1');
  });
});

describe('answers', () => {
  it('counts answered questions and clears one step at a time', () => {
    const answers = {
      ...emptyFinderAnswers,
      faceShape: 'oval' as const,
      faceWidthMm: 140,
      materials: ['metal' as const],
    };
    expect(answeredCount(answers)).toBe(2);
    const cleared = withoutStep(answers, 'face');
    expect(cleared.faceShape).toBeNull();
    expect(cleared.faceWidthMm).toBeNull();
    expect(answeredCount(withoutStep(cleared, 'look'))).toBe(0);
  });
});

describe('toggleAnswer', () => {
  it('adds and removes list values, and chooses or clears single ones', () => {
    const added = toggleAnswer(emptyFinderAnswers, 'vibes', 'bold');
    expect(added.vibes).toEqual(['bold']);
    expect(toggleAnswer(added, 'vibes', 'bold').vibes).toEqual([]);
    const chosen = toggleAnswer(emptyFinderAnswers, 'budget', 'mid');
    expect(chosen.budget).toBe('mid');
    expect(toggleAnswer(chosen, 'budget', 'premium').budget).toBe('premium');
    expect(toggleAnswer(chosen, 'budget', 'mid').budget).toBeNull();
  });
});
