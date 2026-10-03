import type { FaceShape } from '@optical/shared/catalog';

/**
 * Drawing proportions for each face shape, relative to cheekbone width:
 * face length, forehead, jaw and chin widths. Exaggerated a little from
 * the measured prototypes so the shapes read clearly at icon size.
 */
const FIGURES: Record<FaceShape, { length: number; forehead: number; jaw: number; chin: number }> =
  {
    oval: { length: 1.42, forehead: 0.84, jaw: 0.7, chin: 0.3 },
    round: { length: 1.12, forehead: 0.86, jaw: 0.82, chin: 0.42 },
    square: { length: 1.18, forehead: 0.96, jaw: 0.96, chin: 0.62 },
    heart: { length: 1.34, forehead: 1, jaw: 0.6, chin: 0.16 },
    oblong: { length: 1.62, forehead: 0.9, jaw: 0.84, chin: 0.46 },
    diamond: { length: 1.4, forehead: 0.6, jaw: 0.58, chin: 0.2 },
  };

const HALF = 30;
const SIZE = { width: 80, height: 110 };

type Point = [number, number];

/** A smooth closed path through the points (Catmull-Rom as cubic Béziers). */
function smoothPath(points: Point[]): string {
  const at = (index: number) => points[(index + points.length) % points.length] ?? [0, 0];
  const parts = [`M${at(0)[0].toFixed(1)},${at(0)[1].toFixed(1)}`];
  for (let index = 0; index < points.length; index += 1) {
    const [p0, p1, p2, p3] = [at(index - 1), at(index), at(index + 1), at(index + 2)];
    const c1: Point = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Point = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    parts.push(
      `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`,
    );
  }
  return `${parts.join(' ')}Z`;
}

function outline(shape: FaceShape) {
  const figure = FIGURES[shape];
  const height = figure.length * HALF * 2;
  const top = (SIZE.height - height) / 2;
  const cx = SIZE.width / 2;
  const right: Point[] = [
    [figure.forehead * HALF * 0.62, top + height * 0.02],
    [figure.forehead * HALF, top + height * 0.2],
    [HALF, top + height * 0.47],
    [figure.jaw * HALF, top + height * 0.76],
    [figure.chin * HALF, top + height * 0.97],
  ];
  const points: Point[] = [
    [cx, top],
    ...right.map(([x, y]): Point => [cx + x, y]),
    [cx, top + height],
    ...right.reverse().map(([x, y]): Point => [cx - x, y]),
  ];
  return {
    path: smoothPath(points),
    marks: [
      { y: top + height * 0.2, half: figure.forehead * HALF },
      { y: top + height * 0.47, half: HALF },
      { y: top + height * 0.76, half: figure.jaw * HALF },
    ],
  };
}

/** A face outline for the shape picker, with the three widths that define it. */
export function FaceShapeFigure({ shape, className }: { shape: FaceShape; className?: string }) {
  const { path, marks } = outline(shape);
  return (
    <svg
      viewBox={`0 0 ${SIZE.width} ${SIZE.height}`}
      aria-hidden="true"
      className={className}
      fill="none"
    >
      <path d={path} fill="var(--color-surface-muted)" stroke="currentColor" strokeWidth="2" />
      <g stroke="var(--color-accent)" strokeWidth="1" strokeDasharray="2 2">
        {marks.map((mark) => (
          <line
            key={mark.y}
            x1={SIZE.width / 2 - mark.half + 3}
            x2={SIZE.width / 2 + mark.half - 3}
            y1={mark.y}
            y2={mark.y}
          />
        ))}
      </g>
    </svg>
  );
}
