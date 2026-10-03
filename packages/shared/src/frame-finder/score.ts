import type { CategorySlug, ColourFamily, FaceShape, FrameMaterial } from '../catalog/constants';
import { FACE_SHAPE_MATCH } from '../catalog/constants';
import { frameFit } from '../face/measure';
import { finderBudgets, finderVibes, type FinderAnswers, type FinderUse } from './answers';

/** What the scoring needs to know about a frame. */
export interface FinderCandidate {
  id: string;
  category: CategorySlug;
  material: FrameMaterial | null;
  priceMinor: number;
  totalWidthMm: number | null;
  styleTags: readonly string[];
  faceShapes: readonly { faceShape: FaceShape; score: number }[];
  colourFamilies: readonly ColourFamily[];
  /** Average review rating, used only to break ties. */
  rating: number;
}

export type Criterion = 'shape' | 'size' | 'style' | 'budget' | 'use' | 'material' | 'colour';

/**
 * How much each answered question counts. Skipped questions drop out and
 * the rest are rescaled, so skipping never penalises a frame.
 */
export const CRITERION_WEIGHTS: Record<Criterion, number> = {
  shape: 0.3,
  style: 0.2,
  size: 0.15,
  budget: 0.15,
  use: 0.1,
  material: 0.05,
  colour: 0.05,
};

/** A reason shown as "Why this matches", in the UI's words. */
export type MatchReason =
  | { criterion: 'shape'; faceShape: FaceShape }
  | { criterion: 'size'; fit: 'good' }
  | { criterion: 'style'; tags: string[] }
  | { criterion: 'budget' }
  | { criterion: 'use'; use: FinderUse }
  | { criterion: 'material'; material: FrameMaterial }
  | { criterion: 'colour'; colour: ColourFamily };

export interface ScoredFrame {
  id: string;
  /** 0–100: the weighted share of answered criteria the frame meets. */
  score: number;
  /** Each answered criterion's fit, 0–1. */
  parts: Partial<Record<Criterion, number>>;
  /** The strongest positive reasons, best first (at most three). */
  reasons: MatchReason[];
}

const USE_SIGNALS: Record<FinderUse, { categories: CategorySlug[]; tags: string[] }> = {
  everyday: { categories: ['eyeglasses'], tags: ['everyday', 'classic', 'lightweight'] },
  screens: { categories: ['computer-glasses'], tags: ['screen', 'professional', 'lightweight'] },
  outdoors: { categories: ['sunglasses'], tags: ['outdoor', 'durable'] },
  active: { categories: [], tags: ['durable', 'lightweight', 'outdoor'] },
};

function shapePart(candidate: FinderCandidate, faceShape: FaceShape): number {
  return candidate.faceShapes.find((entry) => entry.faceShape === faceShape)?.score ?? 0;
}

function sizePart(candidate: FinderCandidate, faceWidthMm: number): number | null {
  if (!candidate.totalWidthMm) return null;
  const { differenceMm } = frameFit(candidate.totalWidthMm, faceWidthMm);
  // Full marks within the tolerance, then falling to zero 16 mm beyond it.
  return Math.max(0, Math.min(1, 1 - (Math.abs(differenceMm) - 6) / 16));
}

function budgetPart(candidate: FinderCandidate, budget: keyof typeof finderBudgets): number {
  const { minMinor, maxMinor } = finderBudgets[budget];
  if (candidate.priceMinor >= minMinor && (maxMinor === null || candidate.priceMinor <= maxMinor))
    return 1;
  // Just outside the band still scores something; far outside scores nothing.
  const edge = candidate.priceMinor < minMinor ? minMinor : (maxMinor ?? candidate.priceMinor);
  return Math.max(0, 1 - Math.abs(candidate.priceMinor - edge) / Math.max(edge, 1) / 0.25);
}

/**
 * Scores one frame against the answers. Pure and deterministic: the same
 * frame and answers always give the same score and reasons.
 */
export function scoreFrame(candidate: FinderCandidate, answers: FinderAnswers): ScoredFrame {
  const parts: Partial<Record<Criterion, number>> = {};
  const reasons: { reason: MatchReason; strength: number }[] = [];

  if (answers.faceShape) {
    parts.shape = shapePart(candidate, answers.faceShape);
    if (parts.shape >= FACE_SHAPE_MATCH)
      reasons.push({
        reason: { criterion: 'shape', faceShape: answers.faceShape },
        strength: parts.shape * CRITERION_WEIGHTS.shape,
      });
  }
  if (answers.faceWidthMm) {
    const size = sizePart(candidate, answers.faceWidthMm);
    if (size !== null) {
      parts.size = size;
      if (size === 1)
        reasons.push({
          reason: { criterion: 'size', fit: 'good' },
          strength: CRITERION_WEIGHTS.size,
        });
    }
  }
  if (answers.vibes.length) {
    const wanted = new Set<string>(answers.vibes.flatMap((vibe) => finderVibes[vibe]));
    const matched = candidate.styleTags.filter((tag) => wanted.has(tag));
    parts.style = matched.length ? Math.min(1, 0.6 + 0.2 * matched.length) : 0;
    if (matched.length)
      reasons.push({
        reason: { criterion: 'style', tags: matched.slice(0, 2) },
        strength: parts.style * CRITERION_WEIGHTS.style,
      });
  }
  if (answers.budget) {
    parts.budget = budgetPart(candidate, answers.budget);
    if (parts.budget === 1)
      reasons.push({ reason: { criterion: 'budget' }, strength: 0.5 * CRITERION_WEIGHTS.budget });
  }
  if (answers.use) {
    const signals = USE_SIGNALS[answers.use];
    const inCategory = signals.categories.includes(candidate.category);
    const tagged = candidate.styleTags.some((tag) => signals.tags.includes(tag));
    parts.use = inCategory ? 1 : tagged ? 0.7 : 0.3;
    if (parts.use >= 0.7)
      reasons.push({
        reason: { criterion: 'use', use: answers.use },
        strength: parts.use * CRITERION_WEIGHTS.use,
      });
  }
  if (answers.materials.length) {
    const match = candidate.material !== null && answers.materials.includes(candidate.material);
    parts.material = match ? 1 : 0;
    if (match && candidate.material)
      reasons.push({
        reason: { criterion: 'material', material: candidate.material },
        strength: CRITERION_WEIGHTS.material,
      });
  }
  if (answers.colours.length) {
    const colour = answers.colours.find((wanted) => candidate.colourFamilies.includes(wanted));
    parts.colour = colour ? 1 : 0;
    if (colour)
      reasons.push({ reason: { criterion: 'colour', colour }, strength: CRITERION_WEIGHTS.colour });
  }

  const answered = Object.keys(parts) as Criterion[];
  const totalWeight = answered.reduce((sum, criterion) => sum + CRITERION_WEIGHTS[criterion], 0);
  const weighted = answered.reduce(
    (sum, criterion) => sum + CRITERION_WEIGHTS[criterion] * (parts[criterion] ?? 0),
    0,
  );
  return {
    id: candidate.id,
    score: totalWeight ? Math.round((weighted / totalWeight) * 100) : 0,
    parts,
    reasons: reasons
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 3)
      .map((entry) => entry.reason),
  };
}

/**
 * Ranks frames best first. Ties are broken by rating, then id, so the
 * order is stable. With nothing answered, the best-rated frames lead.
 */
export function rankFrames(
  candidates: readonly FinderCandidate[],
  answers: FinderAnswers,
  limit = 24,
): ScoredFrame[] {
  const rating = new Map(candidates.map((candidate) => [candidate.id, candidate.rating]));
  return candidates
    .map((candidate) => scoreFrame(candidate, answers))
    .sort(
      (a, b) =>
        b.score - a.score ||
        (rating.get(b.id) ?? 0) - (rating.get(a.id) ?? 0) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, limit);
}
