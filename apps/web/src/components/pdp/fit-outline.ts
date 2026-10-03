import 'server-only';
import type { FrameShape } from '@optical/shared/catalog';
import { lensOutline } from '@optical/shared/frame-geometry';
import type { UnitOutline } from './fit-diagram';

/**
 * The frame's lens shape as a unit outline. Computed on the server, so the
 * outline maths stays out of the product page's JavaScript.
 */
export function unitLensOutline(shape: FrameShape): UnitOutline {
  return lensOutline(shape, 1, 1, 64).map(
    ([x, y]) => [Math.round(x * 1e4) / 1e4, Math.round(y * 1e4) / 1e4] as const,
  );
}
