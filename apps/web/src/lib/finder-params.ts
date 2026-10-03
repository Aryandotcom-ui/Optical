import { colourFamilies, faceShapes, frameMaterials } from '@optical/shared/catalog';
import {
  emptyFinderAnswers,
  finderBudgets,
  finderUses,
  finderVibes,
  type FinderAnswers,
} from '@optical/shared/frame-finder';

/** The Frame Finder's five questions, in order. Each is optional. */
export const FINDER_STEPS = ['face', 'vibe', 'use', 'budget', 'look'] as const;
export type FinderStep = (typeof FINDER_STEPS)[number];

export interface FinderView {
  answers: FinderAnswers;
  /** Index into FINDER_STEPS. */
  step: number;
  results: boolean;
}

type SearchParams = Record<string, string | string[] | undefined>;

/** Every value of a parameter, from repeats (forms) or a comma list (links). */
function values(params: SearchParams, key: string): string[] {
  const raw = params[key];
  const list = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
  return list.flatMap((entry) => entry.split(',')).filter(Boolean);
}

function pickMany<T extends string>(params: SearchParams, key: string, allowed: readonly T[]): T[] {
  const chosen = new Set(values(params, key));
  // Allowed order, not URL order, so equal answers give equal URLs.
  return allowed.filter((value) => chosen.has(value));
}

function pickOne<T extends string>(
  params: SearchParams,
  key: string,
  allowed: readonly T[],
): T | null {
  const value = values(params, key)[0];
  return allowed.find((entry) => entry === value) ?? null;
}

const vibes = Object.keys(finderVibes) as (keyof typeof finderVibes)[];
const budgets = Object.keys(finderBudgets) as (keyof typeof finderBudgets)[];

/**
 * The Frame Finder's state from the URL. Unknown or malformed values are
 * dropped rather than failing the page, so an old or edited link still works.
 */
export function parseFinderParams(params: SearchParams): FinderView {
  const width = Number(values(params, 'width')[0]);
  const step = Number(values(params, 'step')[0]);
  return {
    answers: {
      faceShape: pickOne(params, 'face', faceShapes),
      faceWidthMm:
        Number.isFinite(width) && width >= 100 && width <= 200 ? Math.round(width) : null,
      vibes: pickMany(params, 'vibe', vibes),
      use: pickOne(params, 'use', finderUses),
      budget: pickOne(params, 'budget', budgets),
      materials: pickMany(params, 'material', frameMaterials),
      colours: pickMany(params, 'colour', colourFamilies),
    },
    step: Number.isInteger(step) && step >= 1 && step <= FINDER_STEPS.length ? step - 1 : 0,
    results: values(params, 'view')[0] === 'results',
  };
}

/** The answers as URL parameters (comma lists), skipping anything unanswered. */
export function finderEntries(answers: FinderAnswers): [string, string][] {
  const entries: [string, string | null][] = [
    ['face', answers.faceShape],
    ['width', answers.faceWidthMm === null ? null : String(answers.faceWidthMm)],
    ['vibe', answers.vibes.join(',') || null],
    ['use', answers.use],
    ['budget', answers.budget],
    ['material', answers.materials.join(',') || null],
    ['colour', answers.colours.join(',') || null],
  ];
  return entries.filter((entry): entry is [string, string] => entry[1] !== null);
}

/** A Frame Finder URL: a step of the questions, or the results. */
export function finderHref(
  answers: FinderAnswers,
  target: { step: number } | 'results' = 'results',
): string {
  const params = new URLSearchParams(finderEntries(answers));
  if (target === 'results') params.set('view', 'results');
  else params.set('step', String(target.step + 1));
  return `/frame-finder?${params.toString()}`;
}

/** How many questions have an answer. */
export function answeredCount(answers: FinderAnswers): number {
  return [
    answers.faceShape,
    answers.vibes.length || null,
    answers.use,
    answers.budget,
    answers.materials.length + answers.colours.length || null,
  ].filter((value) => value !== null).length;
}

/** The answers with one step's answer cleared (Skip, and "remove" on results). */
export function withoutStep(answers: FinderAnswers, step: FinderStep): FinderAnswers {
  switch (step) {
    case 'face':
      return { ...answers, faceShape: null, faceWidthMm: null };
    case 'vibe':
      return { ...answers, vibes: [] };
    case 'use':
      return { ...answers, use: null };
    case 'budget':
      return { ...answers, budget: null };
    case 'look':
      return { ...answers, materials: [], colours: [] };
  }
}

type ListField = 'vibes' | 'materials' | 'colours';
type SingleField = 'faceShape' | 'use' | 'budget';
export type AnswerField = ListField | SingleField;

/**
 * The answers with one value switched: added to or removed from a list,
 * or chosen (and unchosen when it was already the answer). Used by the
 * inline editor on the results, where every option is a link.
 */
export function toggleAnswer(
  answers: FinderAnswers,
  field: AnswerField,
  value: string,
): FinderAnswers {
  if (field === 'vibes' || field === 'materials' || field === 'colours') {
    const list = answers[field] as readonly string[];
    const next = list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value];
    return { ...answers, [field]: next };
  }
  return { ...answers, [field]: answers[field] === value ? null : value };
}

export { emptyFinderAnswers };
