import type { FrameShape } from '../catalog/enums';
import type { Vec2 } from './mesh';

/**
 * Lens outlines. Each shape is a superellipse (separate exponents for the
 * top and bottom halves) plus a shape-specific deformation. The result is
 * rescaled so its bounding box is exactly `width × height` millimetres.
 *
 * Convention: the outline is for a lens centred on the origin, with the
 * nose side towards −x and the temple side towards +x. Points run
 * counter-clockwise when viewed from the front (+z).
 */
interface ShapeRecipe {
  topExponent: number;
  bottomExponent: number;
  deform?: (x: number, y: number) => Vec2;
}

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

const recipes: Record<Exclude<FrameShape, 'hexagon'>, ShapeRecipe> = {
  round: { topExponent: 2, bottomExponent: 2 },
  rectangle: { topExponent: 4.5, bottomExponent: 4 },
  square: { topExponent: 3.6, bottomExponent: 3.4 },
  aviator: {
    topExponent: 4,
    bottomExponent: 2.1,
    // Teardrop: the lower half deepens towards the nose.
    deform: (x, y) => [x, y < 0 ? y * (1 + 0.28 * smoothstep(0.6, -0.9, x)) : y],
  },
  'cat-eye': {
    topExponent: 3.4,
    bottomExponent: 2.4,
    // Upswept outer corner.
    deform: (x, y) => [
      x + 0.12 * Math.max(0, y) * Math.max(0, x),
      y +
        0.6 * Math.max(0, x) ** 2.2 * (y > -0.2 ? 1 : 0.15) -
        0.15 * Math.max(0, -x) * Math.max(0, y),
    ],
  },
  wayfarer: {
    topExponent: 4.2,
    bottomExponent: 2.8,
    // Trapezoid: wider at the top, with the outer top corner lifted slightly.
    deform: (x, y) => [x * (1 + 0.1 * y), y + 0.06 * Math.max(0, x) * Math.max(0, y)],
  },
  browline: { topExponent: 4.2, bottomExponent: 2.6 },
};

function superellipsePoint(angle: number, recipe: ShapeRecipe): Vec2 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const exponent = s >= 0 ? recipe.topExponent : recipe.bottomExponent;
  const x = Math.sign(c) * Math.abs(c) ** (2 / exponent);
  const y = Math.sign(s) * Math.abs(s) ** (2 / exponent);
  return recipe.deform ? recipe.deform(x, y) : [x, y];
}

/** Rounded hexagon with flat top and bottom, via Chaikin corner cutting. */
function hexagonPoints(segments: number): Vec2[] {
  let polygon: Vec2[] = Array.from({ length: 6 }, (_, i) => {
    const angle = (i / 6) * Math.PI * 2;
    return [Math.cos(angle), Math.sin(angle) * 0.9] as const;
  });
  for (let pass = 0; pass < 3; pass += 1) {
    polygon = polygon.flatMap((point, i) => {
      const next = polygon[(i + 1) % polygon.length] ?? point;
      return [
        [point[0] * 0.8 + next[0] * 0.2, point[1] * 0.8 + next[1] * 0.2] as const,
        [point[0] * 0.2 + next[0] * 0.8, point[1] * 0.2 + next[1] * 0.8] as const,
      ];
    });
  }
  return resampleClosed(polygon, segments);
}

/** Resamples a closed polyline to `count` points evenly spaced by arc length. */
export function resampleClosed(points: readonly Vec2[], count: number): Vec2[] {
  const cumulative = [0];
  for (let i = 1; i <= points.length; i += 1) {
    const a = points[i - 1] ?? points[0]!;
    const b = points[i % points.length] ?? points[0]!;
    cumulative.push((cumulative[i - 1] ?? 0) + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = cumulative.at(-1) ?? 0;
  const result: Vec2[] = [];
  let segment = 0;
  for (let k = 0; k < count; k += 1) {
    const target = (k / count) * total;
    while ((cumulative[segment + 1] ?? total) < target) segment += 1;
    const start = cumulative[segment] ?? 0;
    const span = (cumulative[segment + 1] ?? total) - start || 1;
    const t = (target - start) / span;
    const a = points[segment % points.length]!;
    const b = points[(segment + 1) % points.length]!;
    result.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return result;
}

/** Scales and centres points so their bounding box is exactly width × height. */
function fitToBox(points: readonly Vec2[], width: number, height: number): Vec2[] {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...ys),
    Math.max(...ys),
  ];
  const sx = width / (maxX - minX);
  const sy = height / (maxY - minY);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return points.map(([x, y]) => [(x - cx) * sx, (y - cy) * sy]);
}

export function lensOutline(
  shape: FrameShape,
  widthMm: number,
  heightMm: number,
  segments = 96,
): Vec2[] {
  if (widthMm <= 0 || heightMm <= 0) throw new RangeError('Lens dimensions must be positive.');
  const raw =
    shape === 'hexagon'
      ? hexagonPoints(segments)
      : resampleClosed(
          Array.from({ length: segments * 4 }, (_, i) =>
            superellipsePoint((i / (segments * 4)) * Math.PI * 2, recipes[shape]),
          ),
          segments,
        );
  return fitToBox(raw, widthMm, heightMm);
}

/** Outward unit normals of a counter-clockwise closed outline, one per point. */
export function outlineNormals(points: readonly Vec2[]): Vec2[] {
  return points.map((_, i) => {
    const prev = points[(i - 1 + points.length) % points.length]!;
    const next = points[(i + 1) % points.length]!;
    const tx = next[0] - prev[0];
    const ty = next[1] - prev[1];
    const len = Math.hypot(tx, ty) || 1;
    return [ty / len, -tx / len];
  });
}
