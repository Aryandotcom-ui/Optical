import { AVERAGE_IRIS_MM } from './measure';

/** A standard bank card (ISO/IEC 7810 ID-1) is 85.60 mm wide. */
export const CARD_WIDTH_MM = 85.6;
/** Plausible adult PD range; anything outside is reported as a failed measurement. */
export const PD_RANGE_MM = [50, 80] as const;

const roundHalf = (value: number) => Math.round(value * 2) / 2;
const plausible = (value: number) =>
  Number.isFinite(value) && value >= PD_RANGE_MM[0] && value <= PD_RANGE_MM[1];

/**
 * PD from a card held flat against the forehead: the card's width in
 * pixels gives the scale at roughly the depth of the eyes. Rounded to
 * 0.5 mm; null when the result is implausible (card edges misplaced).
 */
export function pdFromCard(pupilDistancePx: number, cardWidthPx: number): number | null {
  if (!(pupilDistancePx > 0) || !(cardWidthPx > 0)) return null;
  const pd = (pupilDistancePx * CARD_WIDTH_MM) / cardWidthPx;
  return plausible(pd) ? roundHalf(pd) : null;
}

/**
 * A quicker, rougher PD from the iris size alone (irises are about
 * 11.7 mm across in most adults, give or take a millimetre).
 */
export function pdFromIris(pupilDistancePx: number, irisDiameterPx: number): number | null {
  if (!(pupilDistancePx > 0) || !(irisDiameterPx > 0)) return null;
  const pd = (pupilDistancePx * AVERAGE_IRIS_MM) / irisDiameterPx;
  return plausible(pd) ? roundHalf(pd) : null;
}

/** Combines several readings: the median, so one bad frame can't skew it. */
export function medianReading(readings: readonly (number | null)[]): number | null {
  const values = readings.filter((value): value is number => value !== null).sort((a, b) => a - b);
  if (values.length === 0) return null;
  const middle = Math.floor(values.length / 2);
  const median =
    values.length % 2
      ? (values[middle] ?? 0)
      : ((values[middle - 1] ?? 0) + (values[middle] ?? 0)) / 2;
  return roundHalf(median);
}
