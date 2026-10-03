import { availabilityOf, type LensSelectionContext } from './availability';
import type { LensCatalog, LensIndexOption } from './catalog';
import { estimateLensThickness } from './thickness';

export interface IndexRecommendation {
  indexCode: string;
  reason: string;
}

function byIndex(a: LensIndexOption, b: LensIndexOption) {
  return a.refractiveIndex - b.refractiveIndex;
}

/**
 * Recommends the thinnest sensible index: the first available material
 * whose recommended range covers the prescription. Thinner materials cost
 * more, so we don't recommend them where the difference is negligible.
 */
export function recommendIndex(
  catalog: LensCatalog,
  context: LensSelectionContext,
  lensWidthMm: number,
): IndexRecommendation | null {
  const available = [...catalog.indexes]
    .sort(byIndex)
    .filter(
      (option) => availabilityOf({ type: 'index', code: option.code }, catalog, context).available,
    );
  const [baseline] = available;
  if (!baseline) return null;

  const power = context.strongestPower;
  if (power === null) {
    return {
      indexCode: baseline.code,
      reason: 'Add your prescription and we will suggest the thinnest sensible lens for it.',
    };
  }

  const choice =
    available.find((option) => power <= option.recommendedUpTo) ?? available.at(-1) ?? baseline;
  const chosenMm = estimateLensThickness({
    power: -power,
    refractiveIndex: choice.refractiveIndex,
    lensWidthMm,
  }).maxMm;
  const standardMm = estimateLensThickness({
    power: -power,
    refractiveIndex: baseline.refractiveIndex,
    lensWidthMm,
  }).maxMm;

  const reason =
    choice.code === baseline.code || chosenMm >= standardMm
      ? `For a power of ${power.toFixed(2)}, ${choice.name} lenses are already slim, about ${chosenMm.toFixed(1)} mm at the thickest point.`
      : `For a power of ${power.toFixed(2)}, ${choice.name} lenses are about ${chosenMm.toFixed(1)} mm at the thickest point, compared with ${standardMm.toFixed(1)} mm for ${baseline.name}.`;
  return { indexCode: choice.code, reason };
}
