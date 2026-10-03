import type { MaterialPreset } from './materials';

/**
 * Per-vertex colours for patterned finishes. Tortoise shell and gradients
 * are painted from 3D position, so the procedural meshes need no UV maps
 * and the pattern flows continuously across rims, bridge and temples.
 */

function hexToRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.replace('#', ''), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

/** Deterministic 3D value noise in [0, 1]. */
function hash3(x: number, y: number, z: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43_758.5453;
  return s - Math.floor(s);
}

function smooth(t: number) {
  return t * t * (3 - 2 * t);
}

export function valueNoise3(x: number, y: number, z: number): number {
  const [xi, yi, zi] = [Math.floor(x), Math.floor(y), Math.floor(z)];
  const [xf, yf, zf] = [smooth(x - xi), smooth(y - yi), smooth(z - zi)];
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const corner = (dx: number, dy: number, dz: number) => hash3(xi + dx, yi + dy, zi + dz);
  const x00 = lerp(corner(0, 0, 0), corner(1, 0, 0), xf);
  const x10 = lerp(corner(0, 1, 0), corner(1, 1, 0), xf);
  const x01 = lerp(corner(0, 0, 1), corner(1, 0, 1), xf);
  const x11 = lerp(corner(0, 1, 1), corner(1, 1, 1), xf);
  return lerp(lerp(x00, x10, yf), lerp(x01, x11, yf), zf);
}

/** Fractal noise (three octaves), in [0, 1]. */
function fbm(x: number, y: number, z: number): number {
  return (
    (valueNoise3(x, y, z) * 4 +
      valueNoise3(x * 2.1, y * 2.1, z * 2.1) * 2 +
      valueNoise3(x * 4.3, y * 4.3, z * 4.3)) /
    7
  );
}

/**
 * Returns an RGB colour per vertex (0–1 floats) for patterned presets, or
 * null for solid ones. `yRange` is the frame's vertical extent, used to
 * orient gradients from top (main colour) to bottom (secondary colour).
 */
export function patternColours(
  positions: Float32Array,
  preset: MaterialPreset,
  yRange: readonly [number, number],
): Float32Array | null {
  if (preset.pattern === 'none' || !preset.secondaryColor) return null;
  const base = hexToRgb(preset.color);
  const accent = hexToRgb(preset.secondaryColor);
  const colours = new Float32Array(positions.length);
  const [minY, maxY] = yRange;
  const height = maxY - minY || 1;

  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i] ?? 0;
    const y = positions[i + 1] ?? 0;
    const z = positions[i + 2] ?? 0;
    let t: number;
    if (preset.pattern === 'tortoise') {
      // Dark blotches over a warm base: threshold stretched fractal noise.
      const n = fbm(x * 0.16, y * 0.3, z * 0.16);
      t = Math.min(1, Math.max(0, (n - 0.42) * 4.5));
    } else {
      t = Math.min(1, Math.max(0, (maxY - y) / height));
    }
    colours[i] = base[0] + (accent[0] - base[0]) * t;
    colours[i + 1] = base[1] + (accent[1] - base[1]) * t;
    colours[i + 2] = base[2] + (accent[2] - base[2]) * t;
  }
  return colours;
}
