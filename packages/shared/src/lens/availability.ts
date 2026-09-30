import type { LensCatalog, LensPurpose, LensRule, OptionRef, RuleCondition } from './catalog';
import type { LensFrameContext } from './config';

export interface Availability {
  available: boolean;
  /** Why it is unavailable, in plain language. Null when available. */
  reason: string | null;
}

export interface LensSelectionContext {
  purpose: LensPurpose;
  frame: LensFrameContext | null;
  /** Strongest power in any meridian, or null when the prescription isn't known yet. */
  strongestPower: number | null;
  /** Options currently chosen (index, package, coatings, tint). */
  selected: readonly OptionRef[];
}

const AVAILABLE: Availability = { available: true, reason: null };

function sameRef(a: OptionRef, b: OptionRef): boolean {
  return a.type === b.type && a.code === b.code;
}

function conditionHolds(condition: RuleCondition, context: LensSelectionContext): boolean {
  switch (condition.type) {
    case 'purpose-in':
      return condition.codes.includes(context.purpose);
    case 'selected':
      return context.selected.some((ref) => sameRef(ref, condition.option));
    case 'rim-type-in':
      return context.frame !== null && condition.rimTypes.includes(context.frame.rimType);
    case 'lens-height-below':
      return context.frame !== null && context.frame.lensHeightMm < condition.mm;
    case 'power-above':
      return context.strongestPower !== null && context.strongestPower > condition.dioptres;
  }
}

/**
 * Does `rule` block `target`? A rule blocks its `forbid` option when all its
 * conditions hold. Pairwise rules are symmetric: "when A is selected, forbid
 * B" also blocks A while B is selected, so the customer can't reach the
 * forbidden combination from either side.
 */
function ruleBlocks(rule: LensRule, target: OptionRef, context: LensSelectionContext): boolean {
  if (sameRef(rule.forbid, target)) {
    return rule.when.every((condition) => conditionHolds(condition, context));
  }
  const selectedConditions = rule.when.filter(
    (condition): condition is Extract<RuleCondition, { type: 'selected' }> =>
      condition.type === 'selected',
  );
  const pointsAtTarget = selectedConditions.find((condition) => sameRef(condition.option, target));
  if (!pointsAtTarget) return false;
  const forbiddenIsSelected = context.selected.some((ref) => sameRef(ref, rule.forbid));
  if (!forbiddenIsSelected) return false;
  return rule.when
    .filter((condition) => condition !== pointsAtTarget)
    .every((condition) => conditionHolds(condition, context));
}

function formatPower(power: number): string {
  return `±${power.toFixed(2)}`;
}

/** Availability of a single option, with the first applicable reason. */
export function availabilityOf(
  target: OptionRef,
  catalog: LensCatalog,
  context: LensSelectionContext,
): Availability {
  if (target.type === 'index' && context.strongestPower !== null) {
    const option = catalog.indexes.find((index) => index.code === target.code);
    if (option && context.strongestPower > option.maxPower) {
      return {
        available: false,
        reason: `Not made in your power. ${option.name} lenses go up to ${formatPower(option.maxPower)}; a thinner material suits your prescription better.`,
      };
    }
  }
  const blocking = catalog.rules.find((rule) => ruleBlocks(rule, target, context));
  return blocking ? { available: false, reason: blocking.reason } : AVAILABLE;
}

export interface LensAvailabilityMap {
  purposes: Record<string, Availability>;
  indexes: Record<string, Availability>;
  coatings: Record<string, Availability>;
  packages: Record<string, Availability>;
  tints: Record<string, Availability>;
}

/** Availability of every option in the catalogue, for rendering the configurator. */
export function lensAvailability(
  catalog: LensCatalog,
  context: LensSelectionContext,
): LensAvailabilityMap {
  const map = (type: OptionRef['type'], options: readonly { code: string }[]) =>
    Object.fromEntries(
      options.map((option) => [
        option.code,
        availabilityOf({ type, code: option.code }, catalog, context),
      ]),
    );
  return {
    purposes: map('purpose', catalog.purposes),
    indexes: map('index', catalog.indexes),
    coatings: map('coating', catalog.coatings),
    packages: map('package', catalog.packages),
    tints: map('tint', catalog.tints),
  };
}
