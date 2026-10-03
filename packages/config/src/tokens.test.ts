import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  mixOver,
  palette,
  statusTints,
  textContrastPairs,
  uiContrastPairs,
  type ColorToken,
} from './tokens';

const presetCss = readFileSync(
  fileURLToPath(new URL('../tailwind/preset.css', import.meta.url)),
  'utf8',
);

function readPaletteBlock(css: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const match of css.matchAll(/--palette-([a-z-]+):\s*(#[0-9a-f]{6});/gi)) {
    const [, name, hex] = match;
    if (name && hex) values[name] = hex.toUpperCase();
  }
  return values;
}

const darkStart = presetCss.indexOf('@media (prefers-color-scheme: dark)');
const cssThemes = {
  light: readPaletteBlock(presetCss.slice(0, darkStart)),
  dark: readPaletteBlock(presetCss.slice(darkStart)),
};

describe.each(['light', 'dark'] as const)('%s theme', (theme) => {
  const colors = palette[theme];

  it('preset.css declares exactly the palette in tokens.ts', () => {
    expect(cssThemes[theme]).toEqual(colors);
  });

  it.each(textContrastPairs)(
    'text %s on %s meets WCAG AA (4.5:1)',
    (fg: ColorToken, bg: ColorToken) => {
      expect(contrastRatio(colors[fg], colors[bg])).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(Object.entries(statusTints))('%s-ink is readable on its %s tint', (status, alpha) => {
    const key = status as keyof typeof statusTints;
    const tint = mixOver(colors[key], colors.background, alpha);
    expect(contrastRatio(colors[`${key}-ink`], tint)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(uiContrastPairs)('UI %s on %s meets 3:1', (fg: ColorToken, bg: ColorToken) => {
    expect(contrastRatio(colors[fg], colors[bg])).toBeGreaterThanOrEqual(3);
  });
});

describe('mixOver', () => {
  it('returns the background at zero opacity and the foreground at full opacity', () => {
    expect(mixOver('#FF0000', '#0000FF', 0)).toBe('#0000FF');
    expect(mixOver('#FF0000', '#0000FF', 1)).toBe('#FF0000');
    expect(mixOver('#FFFFFF', '#000000', 0.5)).toBe('#808080');
  });
});

describe('contrastRatio', () => {
  it('is 21 for black on white and 1 for identical colours', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#0A66FF', '#0A66FF')).toBe(1);
  });

  it('is symmetric', () => {
    expect(contrastRatio('#6E6E73', '#FBFBFD')).toBe(contrastRatio('#FBFBFD', '#6E6E73'));
  });

  it('rejects malformed colours', () => {
    expect(() => contrastRatio('red', '#FFFFFF')).toThrow(/#RRGGBB/);
  });
});
