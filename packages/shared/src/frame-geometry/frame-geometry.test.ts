import { describe, expect, it } from 'vitest';
import { frameFinishes, frameMaterials, frameShapes, rimTypes } from '../catalog/enums';
import { buildFrameGeometry, type FrameGeometryInput } from './frame';
import { materialFor } from './materials';
import { patternColours } from './patterns';
import { mirrorX, type MeshData } from './mesh';
import { lensOutline, outlineNormals, resampleClosed } from './outlines';

const base: FrameGeometryInput = {
  shape: 'rectangle',
  lensWidthMm: 52,
  lensHeightMm: 40,
  bridgeMm: 18,
  templeMm: 145,
  totalWidthMm: 138,
  rimType: 'full-rim',
  material: 'acetate',
};

/** Checks a mesh is well formed; returns a list of problems (empty when sound). */
function meshProblems(mesh: MeshData): string[] {
  const problems: string[] = [];
  const vertices = mesh.positions.length / 3;
  if (vertices === 0) problems.push('no vertices');
  if (mesh.indices.length === 0 || mesh.indices.length % 3 !== 0) problems.push('bad index count');
  if (mesh.indices.some((index) => index >= vertices)) problems.push('index out of range');
  if (mesh.positions.some((value) => !Number.isFinite(value))) problems.push('non-finite position');
  for (let i = 0; i < mesh.normals.length; i += 3) {
    const len = Math.hypot(mesh.normals[i]!, mesh.normals[i + 1]!, mesh.normals[i + 2]!);
    if (Math.abs(len - 1) > 1e-4) {
      problems.push(`normal ${i / 3} has length ${len}`);
      break;
    }
  }
  return problems;
}

describe('lensOutline', () => {
  it.each(frameShapes)('%s fits the lens box exactly and runs counter-clockwise', (shape) => {
    const points = lensOutline(shape, 50, 38);
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(50, 6);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(38, 6);
    const signedArea = points.reduce((sum, [x, y], i) => {
      const [nx, ny] = points[(i + 1) % points.length]!;
      return sum + (x * ny - nx * y);
    }, 0);
    expect(signedArea).toBeGreaterThan(0);
  });

  it('gives each shape a distinct silhouette', () => {
    const areas = frameShapes.map((shape) => {
      const points = lensOutline(shape, 50, 40);
      return Math.round(
        points.reduce(
          (sum, [x, y], i) =>
            sum +
            (x * points[(i + 1) % points.length]![1] - points[(i + 1) % points.length]![0] * y),
          0,
        ) / 2,
      );
    });
    expect(new Set(areas).size).toBe(frameShapes.length);
  });

  it('makes aviators deeper on the nose side', () => {
    const points = lensOutline('aviator', 58, 50);
    const lowest = points.reduce((a, b) => (b[1] < a[1] ? b : a));
    expect(lowest[0]).toBeLessThan(0);
  });

  it('rejects impossible sizes', () => {
    expect(() => lensOutline('round', 0, 40)).toThrow(RangeError);
  });

  it('computes outward normals', () => {
    const points = lensOutline('round', 40, 40, 64);
    const normals = outlineNormals(points);
    points.forEach(([x, y], i) => {
      const [nx, ny] = normals[i]!;
      expect(x * nx + y * ny).toBeGreaterThan(0);
    });
  });

  it('resamples evenly', () => {
    const square = resampleClosed(
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ],
      8,
    );
    expect(square).toHaveLength(8);
    expect(square[2]).toEqual([1, 0]);
  });
});

describe('buildFrameGeometry', () => {
  it('matches the real frame width and temple length', () => {
    const { bounds } = buildFrameGeometry(base);
    const width = bounds.max[0] - bounds.min[0];
    expect(width).toBeGreaterThanOrEqual(base.totalWidthMm);
    expect(width).toBeLessThan(base.totalWidthMm + 8);
    expect(bounds.max[2] - bounds.min[2]).toBeGreaterThan(base.templeMm * 0.85);
    expect(bounds.max[1] - bounds.min[1]).toBeGreaterThan(base.lensHeightMm);
  });

  it('is symmetric about the bridge', () => {
    const { bounds, anchors } = buildFrameGeometry(base);
    expect(bounds.max[0]).toBeCloseTo(-bounds.min[0], 6);
    expect(anchors.lensCentres[0][0]).toBeCloseTo(-anchors.lensCentres[1][0], 6);
    expect(anchors.lensCentres[1][0]).toBeCloseTo(base.bridgeMm / 2 + base.lensWidthMm / 2, 6);
  });

  it('builds sound meshes for every shape, material and rim type', () => {
    for (const shape of frameShapes) {
      for (const material of frameMaterials) {
        for (const rimType of rimTypes) {
          const geometry = buildFrameGeometry({ ...base, shape, material, rimType });
          for (const part of geometry.parts) {
            const problems = meshProblems(part.mesh);
            if (problems.length)
              throw new Error(
                `${shape}/${material}/${rimType} ${part.name}: ${problems.join(', ')}`,
              );
          }
        }
      }
    }
  });

  it('includes the parts each construction needs', () => {
    const names = (input: Partial<FrameGeometryInput>) =>
      buildFrameGeometry({ ...base, ...input }).parts.map((part) => part.name);
    expect(names({})).toEqual(
      expect.arrayContaining(['lens-left', 'lens-right', 'rim-left', 'temple-right', 'bridge']),
    );
    expect(names({ rimType: 'rimless' })).not.toContain('rim-left');
    expect(names({ rimType: 'rimless' })).toContain('lens-edge-right');
    expect(names({ shape: 'aviator', material: 'metal' })).toEqual(
      expect.arrayContaining(['brow-bar', 'nose-pad-left', 'temple-tip-right']),
    );
    expect(names({ shape: 'browline', material: 'mixed' })).toEqual(
      expect.arrayContaining(['rim-brow-left', 'rim-lower-right']),
    );
    expect(names({ nosePads: true })).toContain('nose-pad-right');
  });

  it('is deterministic', () => {
    const a = buildFrameGeometry(base).parts[0]!.mesh.positions;
    const b = buildFrameGeometry(base).parts[0]!.mesh.positions;
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('puts the bridge anchor above the lens centres and temples behind the front', () => {
    const { anchors, bounds } = buildFrameGeometry(base);
    expect(anchors.bridgeCentre[1]).toBeGreaterThan(0);
    expect(anchors.hinges[1][2]).toBeLessThan(0);
    expect(bounds.min[2]).toBeLessThan(-100);
  });

  it('rejects missing measurements', () => {
    expect(() => buildFrameGeometry({ ...base, templeMm: 0 })).toThrow(RangeError);
    expect(() => buildFrameGeometry({ ...base, bridgeMm: Number.NaN })).toThrow(RangeError);
  });
});

describe('mirrorX', () => {
  it('negates x and flips winding', () => {
    const mesh: MeshData = {
      positions: new Float32Array([1, 0, 0, 2, 0, 0, 1, 1, 0]),
      normals: new Float32Array([1, 0, 0, 1, 0, 0, 1, 0, 0]),
      indices: new Uint32Array([0, 1, 2]),
    };
    const mirrored = mirrorX(mesh);
    expect(Array.from(mirrored.positions)).toEqual([-1, 0, 0, -2, 0, 0, -1, 1, 0]);
    expect(Array.from(mirrored.indices)).toEqual([0, 2, 1]);
    expect(mirrored.normals[0]).toBe(-1);
  });
});

describe('materialFor', () => {
  it('returns a preset for every finish and role', () => {
    for (const finish of frameFinishes) {
      for (const role of ['front', 'temple', 'metal', 'lens', 'lens-edge', 'pad'] as const) {
        const preset = materialFor(role, { finish, colorHex: '#123456' });
        expect(preset.opacity).toBeGreaterThan(0);
        expect(preset.opacity).toBeLessThanOrEqual(1);
      }
    }
  });

  it('makes tinted lenses darker than clear ones and tortoise patterned', () => {
    const clear = materialFor('lens', { finish: 'glossy', colorHex: '#000000' });
    const tinted = materialFor('lens', {
      finish: 'glossy',
      colorHex: '#000000',
      lensTintHex: '#3E4146',
      lensTintStrength: 0.8,
    });
    expect(tinted.opacity).toBeGreaterThan(clear.opacity);
    expect(materialFor('front', { finish: 'tortoise', colorHex: '#6B3E1E' }).pattern).toBe(
      'tortoise',
    );
    expect(materialFor('metal', { finish: 'metallic', colorHex: '#C9A45C' }).color).toBe('#C9A45C');
  });
});

describe('patternColours', () => {
  const positions = new Float32Array([0, 20, 0, 0, -20, 0, 10, 0, 5, -10, 3, -2]);

  it('returns null for solid finishes', () => {
    expect(
      patternColours(
        positions,
        materialFor('front', { finish: 'glossy', colorHex: '#000000' }),
        [-20, 20],
      ),
    ).toBeNull();
  });

  it('runs gradients from the main colour at the top to the secondary at the bottom', () => {
    const colours = patternColours(
      positions,
      materialFor('front', { finish: 'gradient', colorHex: '#000000', secondaryHex: '#FFFFFF' }),
      [-20, 20],
    )!;
    expect(Array.from(colours.slice(0, 3))).toEqual([0, 0, 0]);
    expect(Array.from(colours.slice(3, 6))).toEqual([1, 1, 1]);
  });

  it('mixes tortoise colours deterministically within the two tones', () => {
    const preset = materialFor('front', {
      finish: 'tortoise',
      colorHex: '#7A4520',
      secondaryHex: '#2A160A',
    });
    const a = patternColours(positions, preset, [-20, 20])!;
    const b = patternColours(positions, preset, [-20, 20])!;
    expect(Array.from(a)).toEqual(Array.from(b));
    // Each channel stays between the two tones' values for that channel.
    const bounds = [
      [0x2a, 0x7a],
      [0x16, 0x45],
      [0x0a, 0x20],
    ] as const;
    a.forEach((value, i) => {
      const [low, high] = bounds[i % 3]!;
      expect(value).toBeGreaterThanOrEqual(low / 255 - 1e-6);
      expect(value).toBeLessThanOrEqual(high / 255 + 1e-6);
    });
  });
});
