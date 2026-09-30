/**
 * Approximate lens thickness for the edge-thickness visualiser and index
 * recommendations. Uses the sag formula on a single spherical surface:
 *   R = 1000 × (n − 1) / |P|,   sag = R − √(R² − r²)
 * Minus lenses are thinnest at the centre, plus lenses at the edge.
 * Real lenses vary with base curve and decentration; this is an estimate
 * for comparison between options, labelled as such in the UI.
 */
export interface ThicknessEstimate {
  centreMm: number;
  edgeMm: number;
  /** The thicker of the two, the number customers notice. */
  maxMm: number;
}

/** Minimum centre thickness for minus lenses, by material strength. */
function minCentreMm(refractiveIndex: number): number {
  if (refractiveIndex >= 1.67) return 1.4;
  if (refractiveIndex >= 1.59) return 1.5;
  return 1.8;
}

const MIN_PLUS_EDGE_MM = 1;
const PLANO_THICKNESS_MM = 2;
/** Allowance for decentring the optical centre towards the nose. */
const DECENTRATION_MM = 3;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function estimateLensThickness(input: {
  power: number;
  refractiveIndex: number;
  lensWidthMm: number;
}): ThicknessEstimate {
  const { power, refractiveIndex, lensWidthMm } = input;
  if (refractiveIndex <= 1) throw new RangeError('Refractive index must be above 1.');
  if (power === 0) {
    return { centreMm: PLANO_THICKNESS_MM, edgeMm: PLANO_THICKNESS_MM, maxMm: PLANO_THICKNESS_MM };
  }
  const radiusOfCurvature = (1000 * (refractiveIndex - 1)) / Math.abs(power);
  const semiAperture = Math.min(lensWidthMm / 2 + DECENTRATION_MM, radiusOfCurvature * 0.95);
  const sag = radiusOfCurvature - Math.sqrt(radiusOfCurvature ** 2 - semiAperture ** 2);

  if (power < 0) {
    const centre = minCentreMm(refractiveIndex);
    const edge = centre + sag;
    return { centreMm: round1(centre), edgeMm: round1(edge), maxMm: round1(edge) };
  }
  const centre = MIN_PLUS_EDGE_MM + sag;
  return { centreMm: round1(centre), edgeMm: MIN_PLUS_EDGE_MM, maxMm: round1(centre) };
}
