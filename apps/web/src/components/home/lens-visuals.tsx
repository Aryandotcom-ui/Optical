import { useId } from 'react';

/**
 * Illustrations for the lens story. Plain SVG, no images: they scale, theme
 * with the palette and weigh almost nothing.
 */

export type LensStep = 'thin' | 'clarity' | 'screens' | 'sun';

/** Paraxial estimate of a minus lens's edge: centre thickness plus the sag of a −4.00 D surface. */
export function edgeThicknessMm(
  refractiveIndex: number,
  power = -4,
  diameterMm = 60,
  centreMm = 1.5,
): number {
  const radiusM = (refractiveIndex - 1) / Math.abs(power);
  const halfM = diameterMm / 2 / 1000;
  return centreMm + (halfM * halfM * 1000) / (2 * radiusM);
}

function ThinVisual({ indexes }: { indexes: { code: string; refractiveIndex: number }[] }) {
  const width = 300;
  const column = width / indexes.length;
  return (
    <svg viewBox={`0 0 ${width} 170`} className="h-auto w-full" aria-hidden="true">
      {indexes.map((index, position) => {
        const edge = edgeThicknessMm(index.refractiveIndex);
        const x = position * column + column / 2;
        const scale = 9; // px per mm
        const halfEdge = (edge * scale) / 2;
        const halfCentre = (1.5 * scale) / 2;
        const top = 30;
        const height = 100;
        // A concave (minus) lens in section: thick edges, thin centre.
        const d = `M ${x - halfEdge} ${top} Q ${x - halfCentre} ${top + height / 2} ${x - halfEdge} ${top + height} L ${x + halfEdge} ${top + height} Q ${x + halfCentre} ${top + height / 2} ${x + halfEdge} ${top} Z`;
        return (
          <g key={index.code}>
            <path
              d={d}
              fill="var(--color-accent)"
              fillOpacity={0.18}
              stroke="var(--color-accent)"
              strokeWidth="1.2"
            />
            <text
              x={x}
              y={top - 10}
              textAnchor="middle"
              fontSize="11"
              fill="currentColor"
              className="tabular"
            >
              {index.code}
            </text>
            <text
              x={x}
              y={top + height + 22}
              textAnchor="middle"
              fontSize="10"
              fill="var(--color-ink-secondary)"
              className="tabular"
            >
              {`${edge.toFixed(1)} mm`}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function ClarityVisual({ without, withLabel }: { without: string; withLabel: string }) {
  return (
    <svg viewBox="0 0 300 170" className="h-auto w-full" aria-hidden="true">
      {[
        { cx: 80, glare: true, label: without },
        { cx: 220, glare: false, label: withLabel },
      ].map((lens) => (
        <g key={lens.cx}>
          <ellipse
            cx={lens.cx}
            cy={75}
            rx={58}
            ry={48}
            fill="var(--color-surface)"
            stroke="currentColor"
            strokeWidth="2"
          />
          <circle cx={lens.cx - 12} cy={78} r={7} fill="currentColor" opacity={0.75} />
          <circle cx={lens.cx + 14} cy={78} r={7} fill="currentColor" opacity={0.75} />
          {lens.glare ? (
            <g fill="currentColor" opacity={0.3}>
              <path
                d={`M ${lens.cx - 44} 55 L ${lens.cx + 10} 38 L ${lens.cx + 18} 52 L ${lens.cx - 36} 70 Z`}
              />
              <path
                d={`M ${lens.cx - 20} 102 L ${lens.cx + 40} 82 L ${lens.cx + 44} 92 L ${lens.cx - 14} 112 Z`}
                opacity={0.7}
              />
            </g>
          ) : null}
          {lens.glare ? (
            <ellipse cx={lens.cx} cy={75} rx={58} ry={48} fill="var(--color-ink)" opacity={0.08} />
          ) : null}
          <text x={lens.cx} y={150} textAnchor="middle" fontSize="11" fill="currentColor">
            {lens.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

function ScreensVisual() {
  // A rough visible spectrum; the shaded band marks the blue-violet a filter trims.
  // The illustration appears twice on the page (pinned and inline), so the gradient id must be unique.
  const gradient = useId();
  return (
    <svg viewBox="0 0 300 170" className="h-auto w-full" aria-hidden="true">
      <defs>
        <linearGradient id={gradient} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#6A3FD1" />
          <stop offset="0.18" stopColor="#3466E0" />
          <stop offset="0.38" stopColor="#2FA8C9" />
          <stop offset="0.55" stopColor="#4CB05A" />
          <stop offset="0.72" stopColor="#E8C93A" />
          <stop offset="0.86" stopColor="#E8892E" />
          <stop offset="1" stopColor="#D2402E" />
        </linearGradient>
      </defs>
      <rect x="20" y="50" width="260" height="50" rx="8" fill={`url(#${gradient})`} />
      <rect
        x="20"
        y="40"
        width="48"
        height="70"
        rx="8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="4 3"
      />
      <text
        x="44"
        y="130"
        textAnchor="middle"
        fontSize="10"
        fill="var(--color-ink-secondary)"
        className="tabular"
      >
        400–455 nm
      </text>
      <text x="20" y="28" fontSize="10" fill="var(--color-ink-secondary)" className="tabular">
        400 nm
      </text>
      <text
        x="280"
        y="28"
        textAnchor="end"
        fontSize="10"
        fill="var(--color-ink-secondary)"
        className="tabular"
      >
        700 nm
      </text>
    </svg>
  );
}

function SunVisual({ tints }: { tints: { name: string; hex: string }[] }) {
  return (
    <svg viewBox="0 0 300 170" className="h-auto w-full" aria-hidden="true">
      {tints.slice(0, 5).map((tint, index) => {
        const cx = 40 + index * 55;
        return (
          <g key={tint.name}>
            <circle cx={cx} cy={70} r={24} fill={tint.hex} />
            <circle cx={cx - 8} cy={62} r={6} fill="#fff" opacity={0.25} />
            <text
              x={cx}
              y={118}
              textAnchor="middle"
              fontSize="10"
              fill="var(--color-ink-secondary)"
            >
              {tint.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export interface LensVisualData {
  indexes: { code: string; refractiveIndex: number }[];
  tints: { name: string; hex: string }[];
  labels: { without: string; with: string };
}

export function LensVisual({ step, data }: { step: LensStep; data: LensVisualData }) {
  if (step === 'thin') return <ThinVisual indexes={data.indexes} />;
  if (step === 'clarity')
    return <ClarityVisual without={data.labels.without} withLabel={data.labels.with} />;
  if (step === 'screens') return <ScreensVisual />;
  return <SunVisual tints={data.tints} />;
}
