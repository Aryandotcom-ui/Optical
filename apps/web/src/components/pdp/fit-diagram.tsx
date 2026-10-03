/** A lens outline fitted to a 1 × 1 box, centred; scaled to any lens size. */
export type UnitOutline = readonly (readonly [number, number])[];

/** ISO/IEC 7810 ID-1: every bank card is this size, so it makes a familiar ruler. */
const CARD = { width: 85.6, height: 53.98, radius: 3.18 };
/** Hinge blocks stick out past the lenses by about this much on each side. */
const ENDPIECE_MM = 5;

export interface FrameSize {
  lensWidthMm: number;
  bridgeMm: number;
  lensHeightMm: number;
}

/** Total front width implied by the three numbers printed on a temple arm. */
export function estimatedTotalWidth(size: Pick<FrameSize, 'lensWidthMm' | 'bridgeMm'>): number {
  return size.lensWidthMm * 2 + size.bridgeMm + ENDPIECE_MM * 2;
}

function lensPath(outline: UnitOutline, size: FrameSize, side: 1 | -1): string {
  const centreX = side * (size.bridgeMm / 2 + size.lensWidthMm / 2);
  return `${outline
    .map(
      ([x, y], index) =>
        `${index === 0 ? 'M' : 'L'}${(centreX + side * x * size.lensWidthMm).toFixed(2)},${(-y * size.lensHeightMm).toFixed(2)}`,
    )
    .join(' ')} Z`;
}

/**
 * The frame front drawn to scale (1 unit = 1 mm) next to a bank card, with
 * the lens width, bridge and total width marked. An optional second outline
 * shows the customer's own glasses for comparison.
 */
export function FitDiagram({
  outline,
  size,
  totalWidthMm,
  compare,
  labels,
}: {
  outline: UnitOutline;
  size: FrameSize;
  totalWidthMm: number;
  compare?: FrameSize | null;
  labels: {
    title: string;
    lens: string;
    bridge: string;
    total: string;
    card: string;
    yours: string;
  };
}) {
  const compareWidth = compare ? estimatedTotalWidth(compare) : 0;
  const half = Math.max(totalWidthMm, compareWidth) / 2;
  const lensTop = -Math.max(size.lensHeightMm, compare?.lensHeightMm ?? 0) / 2;
  const cardX = half + 14;
  const cardY = -CARD.height / 2;
  const minX = -half - 4;
  const width = cardX + CARD.width + 4 - minX;
  const top = lensTop - 16;
  const height = Math.max(CARD.height / 2, size.lensHeightMm / 2) + 26 - top;
  const lensRight = size.bridgeMm / 2 + size.lensWidthMm;

  return (
    <svg
      viewBox={`${minX} ${top} ${width} ${height}`}
      role="img"
      aria-label={labels.title}
      className="h-auto w-full text-ink"
    >
      {compare ? (
        <g fill="none" stroke="var(--color-accent)" strokeWidth="0.7" strokeDasharray="2 1.5">
          <path d={lensPath(outline, compare, 1)} />
          <path d={lensPath(outline, compare, -1)} />
        </g>
      ) : null}
      <g fill="var(--color-surface-muted)" stroke="currentColor" strokeWidth="1.1">
        <path d={lensPath(outline, size, 1)} />
        <path d={lensPath(outline, size, -1)} />
      </g>
      <line
        x1={-totalWidthMm / 2}
        x2={-lensRight}
        y1={0}
        y2={0}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <line
        x1={lensRight}
        x2={totalWidthMm / 2}
        y1={0}
        y2={0}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />

      <g fill="currentColor" fontSize="4.2" textAnchor="middle" className="tabular" stroke="none">
        {/* lens width */}
        <line
          x1={size.bridgeMm / 2}
          x2={lensRight}
          y1={lensTop - 6}
          y2={lensTop - 6}
          stroke="currentColor"
          strokeWidth="0.35"
        />
        <text x={size.bridgeMm / 2 + size.lensWidthMm / 2} y={lensTop - 8}>
          {labels.lens}
        </text>
        {/* bridge */}
        <line
          x1={-size.bridgeMm / 2}
          x2={size.bridgeMm / 2}
          y1={lensTop + 4}
          y2={lensTop + 4}
          stroke="currentColor"
          strokeWidth="0.35"
        />
        <text x={0} y={lensTop + 2.5}>
          {labels.bridge}
        </text>
        {/* total width */}
        <line
          x1={-totalWidthMm / 2}
          x2={totalWidthMm / 2}
          y1={size.lensHeightMm / 2 + 8}
          y2={size.lensHeightMm / 2 + 8}
          stroke="currentColor"
          strokeWidth="0.35"
        />
        <text x={0} y={size.lensHeightMm / 2 + 14}>
          {labels.total}
        </text>
      </g>

      <rect
        x={cardX}
        y={cardY}
        width={CARD.width}
        height={CARD.height}
        rx={CARD.radius}
        fill="none"
        stroke="var(--color-ink-secondary)"
        strokeWidth="0.6"
      />
      <rect
        x={cardX + 8}
        y={cardY + 15}
        width={11}
        height={8.5}
        rx={1.5}
        fill="none"
        stroke="var(--color-ink-secondary)"
        strokeWidth="0.5"
      />
      <text
        x={cardX + CARD.width / 2}
        y={CARD.height / 2 + 8}
        fontSize="4.2"
        textAnchor="middle"
        fill="var(--color-ink-secondary)"
      >
        {labels.card}
      </text>
      {compare ? (
        <text x={minX + 2} y={top + 6} fontSize="4.2" fill="var(--color-accent)">
          {labels.yours}
        </text>
      ) : null}
    </svg>
  );
}
