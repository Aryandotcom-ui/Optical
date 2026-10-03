/**
 * Design tokens. `tailwind/preset.css` mirrors these values as CSS custom
 * properties; `tokens.test.ts` fails if the two drift apart or if a
 * text/background pairing drops below WCAG AA contrast.
 */
export const palette = {
  light: {
    background: '#FBFBFD',
    surface: '#FFFFFF',
    'surface-muted': '#F5F5F7',
    ink: '#1D1D1F',
    'ink-secondary': '#6E6E73',
    hairline: '#E5E5EA',
    accent: '#0A66FF',
    'accent-strong': '#0A66FF',
    'on-accent': '#FFFFFF',
    success: '#1F9D55',
    'success-ink': '#15703C',
    warning: '#B7791F',
    'warning-ink': '#8F5A0B',
    danger: '#D93025',
    'danger-ink': '#B3261E',
  },
  dark: {
    background: '#000000',
    surface: '#1C1C1E',
    'surface-muted': '#2C2C2E',
    ink: '#F5F5F7',
    'ink-secondary': '#A1A1A6',
    hairline: '#38383A',
    accent: '#4C8DFF',
    'accent-strong': '#2F6FEB',
    'on-accent': '#FFFFFF',
    success: '#34C77B',
    'success-ink': '#34C77B',
    warning: '#E0A43A',
    'warning-ink': '#E0A43A',
    danger: '#FF6B5E',
    'danger-ink': '#FF6B5E',
  },
} as const;

export type ColorToken = keyof (typeof palette)['light'];

/** Foreground/background pairs that carry text and must meet 4.5:1. */
export const textContrastPairs: readonly (readonly [fg: ColorToken, bg: ColorToken])[] = [
  ['ink', 'background'],
  ['ink', 'surface'],
  ['ink', 'surface-muted'],
  ['ink-secondary', 'background'],
  ['ink-secondary', 'surface'],
  ['accent', 'background'],
  ['accent', 'surface'],
  ['on-accent', 'accent-strong'],
  ['success-ink', 'surface'],
  ['warning-ink', 'surface'],
  ['danger-ink', 'surface'],
];

/** Pairs for non-text UI (borders of inputs, icons, focus rings) that must meet 3:1. */
export const uiContrastPairs: readonly (readonly [fg: ColorToken, bg: ColorToken])[] = [
  ['accent', 'surface'],
  ['success', 'surface'],
  ['warning', 'surface'],
  ['danger', 'surface'],
];

/**
 * Opacity of the tinted backgrounds behind status messages (`bg-success/10`
 * and so on). Each status's `-ink` colour must stay readable on its tint.
 */
export const statusTints = { success: 0.1, warning: 0.12, danger: 0.1 } as const;

export const motion = {
  easing: {
    standard: 'cubic-bezier(0.22, 1, 0.36, 1)',
  },
  durationMs: {
    micro: 150,
    ui: 350,
    scene: 700,
  },
  /** Spring used when releasing a drag (Framer Motion units). */
  dragSpring: { type: 'spring', stiffness: 300, damping: 30 },
} as const;

export const radius = {
  control: '12px',
  card: '20px',
  media: '28px',
  pill: '9999px',
} as const;

/** Relative luminance per WCAG 2.2. */
export function relativeLuminance(hex: string): number {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match?.[1]) throw new Error(`Expected a #RRGGBB colour, got "${hex}".`);
  const value = match[1];
  const channel = (offset: number): number => {
    const c = parseInt(value.slice(offset, offset + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

/** Composites `foreground` at `alpha` opacity over an opaque `background`. */
export function mixOver(foreground: string, background: string, alpha: number): string {
  const channels = (hex: string) =>
    [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
  const fg = channels(foreground);
  const bg = channels(background);
  const mixed = fg.map((value, index) =>
    Math.round(value * alpha + (bg[index] ?? 0) * (1 - alpha)),
  );
  return `#${mixed
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
}

/** WCAG contrast ratio between two #RRGGBB colours, from 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (lighter + 0.05) / (darker + 0.05);
}
