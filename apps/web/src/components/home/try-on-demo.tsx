import type { FrameShape } from '@optical/shared/catalog';
import { lensOutline } from '@optical/shared/frame-geometry';
import { cn } from '@/lib/cn';

/** Face and frame measurements for the drawing, in millimetres. */
const PD = 63;
const BRIDGE = 18;

const PAIRS: {
  shape: FrameShape;
  lens: [number, number];
  rim: string;
  rimWidth: number;
  tint: string | null;
}[] = [
  { shape: 'round', lens: [48, 46], rim: '#1c1c1f', rimWidth: 3.2, tint: null },
  { shape: 'rectangle', lens: [52, 38], rim: '#6b3f1f', rimWidth: 3.6, tint: null },
  { shape: 'aviator', lens: [56, 48], rim: '#b48a3c', rimWidth: 1.6, tint: '#3d4a44' },
];

function lensPath(shape: FrameShape, [width, height]: [number, number], side: 1 | -1): string {
  const centre = side * (BRIDGE / 2 + width / 2);
  const points = lensOutline(shape, width, height, 48);
  return `${points
    .map(
      ([x, y], index) =>
        `${index === 0 ? 'M' : 'L'}${(centre + side * x).toFixed(1)},${(-y + 2).toFixed(1)}`,
    )
    .join(' ')}Z`;
}

/**
 * "See it on you" on the home page: an illustrated face trying three
 * frames in turn, drawn from the same lens outlines as the 3D frames. It
 * is a drawing, not a recording, and needs neither JavaScript nor a
 * camera; with reduced motion it holds still on the first pair.
 */
export function TryOnDemo({ label }: { label: string }) {
  return (
    <svg viewBox="-100 -120 200 240" role="img" aria-label={label} className="h-auto w-full">
      <g className="origin-[100px_200px] motion-safe:animate-head-sway">
        {/* Hair behind the face, then ears, face and neck. */}
        <path
          d="M-78 10 C-92 -70 -50 -112 0 -112 C50 -112 92 -70 78 10 L70 -20 C60 -70 -60 -70 -70 -20Z"
          fill="#3a2a22"
        />
        <ellipse cx="-72" cy="8" rx="9" ry="16" fill="#e2b79a" />
        <ellipse cx="72" cy="8" rx="9" ry="16" fill="#e2b79a" />
        <path d="M-24 80 L-26 120 L26 120 L24 80Z" fill="#d9ab8d" />
        <path
          d="M0 -92 C42 -92 70 -66 70 -16 C70 34 46 92 0 92 C-46 92 -70 34 -70 -16 C-70 -66 -42 -92 0 -92Z"
          fill="#ecc4a8"
        />
        <path
          d="M-70 -24 C-66 -76 -30 -96 0 -96 C30 -96 66 -76 70 -24 C56 -60 22 -72 0 -66 C-22 -72 -56 -60 -70 -24Z"
          fill="#3a2a22"
        />
        {/* Brows, eyes, nose, mouth. */}
        <g stroke="#4a362b" strokeWidth="3" strokeLinecap="round" fill="none">
          <path d="M-46 -22 Q-32 -30 -18 -23" />
          <path d="M46 -22 Q32 -30 18 -23" />
        </g>
        {[-1, 1].map((side) => (
          <g key={side}>
            <ellipse cx={(side * PD) / 2} cy="2" rx="9" ry="5.5" fill="#ffffff" />
            <circle cx={(side * PD) / 2} cy="2" r="4.6" fill="#5b4636" />
            <circle cx={(side * PD) / 2} cy="2" r="2" fill="#1c1c1f" />
          </g>
        ))}
        <path
          d="M-3 4 Q-6 26 -10 34 Q0 40 10 34"
          stroke="#c99a7c"
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M-18 56 Q0 66 18 56"
          stroke="#b5675a"
          strokeWidth="3.5"
          fill="none"
          strokeLinecap="round"
        />

        {PAIRS.map((pair, index) => {
          const [width] = pair.lens;
          const outer = BRIDGE / 2 + width;
          return (
            <g
              key={pair.shape}
              className={cn(
                'motion-safe:animate-try-on-cycle',
                index === 0 ? 'opacity-100' : 'opacity-0',
                index === 1 && '[animation-delay:3s]',
                index === 2 && '[animation-delay:6s]',
              )}
            >
              {([-1, 1] as const).map((side) => (
                <path
                  key={side}
                  d={lensPath(pair.shape, pair.lens, side)}
                  fill={pair.tint ?? '#ffffff'}
                  fillOpacity={pair.tint ? 0.72 : 0.18}
                  stroke={pair.rim}
                  strokeWidth={pair.rimWidth}
                />
              ))}
              <path
                d={`M${-BRIDGE / 2 - 1} -4 Q0 -10 ${BRIDGE / 2 + 1} -4`}
                stroke={pair.rim}
                strokeWidth={pair.rimWidth}
                fill="none"
              />
              <path
                d={`M${-outer} -6 L-71 -8 M${outer} -6 L71 -8`}
                stroke={pair.rim}
                strokeWidth={pair.rimWidth}
                strokeLinecap="round"
              />
            </g>
          );
        })}
      </g>
    </svg>
  );
}
