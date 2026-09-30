import { assertMinorUnits, type MinorUnits } from '../money/money';

/**
 * Splits `total` across `weights` in proportion, using the largest-remainder
 * method so the parts are whole minor units that add up to `total` exactly.
 * Ties go to the earlier weight, so the result is deterministic.
 */
export function allocateProportionally(
  total: MinorUnits,
  weights: readonly MinorUnits[],
): MinorUnits[] {
  assertMinorUnits(total, 'total');
  if (total < 0) throw new RangeError('Cannot allocate a negative amount.');
  weights.forEach((weight) => {
    assertMinorUnits(weight, 'weight');
    if (weight < 0) throw new RangeError('Weights must not be negative.');
  });

  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  if (weights.length === 0 || total === 0) return weights.map(() => 0);
  if (weightSum === 0) throw new RangeError('Cannot allocate across weights that sum to zero.');

  // Integer arithmetic throughout, so large amounts never lose precision.
  const bigTotal = BigInt(total);
  const bigSum = BigInt(weightSum);
  const shares = weights.map((weight, index) => {
    const numerator = bigTotal * BigInt(weight);
    return { index, floor: Number(numerator / bigSum), remainder: numerator % bigSum };
  });
  let leftover = total - shares.reduce((sum, share) => sum + share.floor, 0);
  const byRemainder = [...shares].sort((a, b) =>
    a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1,
  );
  const result = shares.map((share) => share.floor);
  for (const share of byRemainder) {
    if (leftover === 0) break;
    result[share.index] = (result[share.index] ?? 0) + 1;
    leftover -= 1;
  }
  return result;
}
