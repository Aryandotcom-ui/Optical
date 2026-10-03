import type { FrameMaterial, FrameShape, RimType } from '../catalog/enums';
import {
  circleProfile,
  cross,
  ellipsoid,
  MeshBuilder,
  mirrorX,
  normalize,
  roundedRectProfile,
  sub,
  sweep,
  type MeshData,
  type Vec2,
  type Vec3,
} from './mesh';
import { lensOutline, outlineNormals } from './outlines';

export interface FrameGeometryInput {
  shape: FrameShape;
  lensWidthMm: number;
  lensHeightMm: number;
  bridgeMm: number;
  templeMm: number;
  totalWidthMm: number;
  rimType: RimType;
  material: FrameMaterial;
  /** Adjustable silicone pads; defaults to true for metal and titanium frames. */
  nosePads?: boolean;
}

/**
 * What each part is made of, so renderers can assign materials:
 * `front` is the frame colour, `metal` is exposed metal (hinges, wire
 * rims, bridges), `temple` is the arm (or its tip), `lens` is glass,
 * `lens-edge` is the lens's polished side wall (visible on rimless and
 * half-rim frames), and `pad` is clear silicone.
 */
export type PartRole = 'front' | 'temple' | 'metal' | 'lens' | 'lens-edge' | 'pad';

export interface FramePart {
  name: string;
  role: PartRole;
  mesh: MeshData;
}

export interface FrameGeometry {
  parts: FramePart[];
  bounds: { min: Vec3; max: Vec3 };
  /** Points the try-on and viewers align to, in millimetres. */
  anchors: { bridgeCentre: Vec3; lensCentres: [Vec3, Vec3]; hinges: [Vec3, Vec3] };
}

interface Style {
  rimWidth: number;
  rimDepth: number;
  rimRole: PartRole;
  round: boolean;
  metalTemples: boolean;
}

/** Slight wrap: the front curves back towards the temples. */
const WRAP_RADIANS = (5 * Math.PI) / 180;
const LENS_BULGE_MM = 1.2;
const LENS_EDGE_MM = 1.8;
const EAR_BEND_RADIANS = (40 * Math.PI) / 180;

function styleFor(material: FrameMaterial): Style {
  switch (material) {
    case 'acetate':
      return { rimWidth: 4.4, rimDepth: 4.2, rimRole: 'front', round: false, metalTemples: false };
    case 'tr90':
      return { rimWidth: 3.4, rimDepth: 3.4, rimRole: 'front', round: false, metalTemples: false };
    case 'mixed':
      return { rimWidth: 3.8, rimDepth: 3.6, rimRole: 'front', round: false, metalTemples: true };
    case 'metal':
      return { rimWidth: 1.7, rimDepth: 1.9, rimRole: 'front', round: true, metalTemples: true };
    case 'titanium':
      return { rimWidth: 1.3, rimDepth: 1.5, rimRole: 'front', round: true, metalTemples: true };
  }
}

function rimProfile(style: Style, width: number, depth: number): Vec2[] {
  return style.round && width < 2.5
    ? circleProfile(width / 2, 10).map(([u, v]) => [u, (v * depth) / width] as const)
    : roundedRectProfile(width, depth, Math.min(width, depth) * 0.35);
}

/** Frame vectors for a path point from its tangent, keeping "up" close to +y. */
function frameAlong(point: Vec3, tangent: Vec3) {
  const side = normalize(cross(tangent, [0, 1, 0]));
  const up = normalize(cross(side, tangent));
  return { point, side, up };
}

function framesForPath(points: readonly Vec3[]) {
  return points.map((point, i) => {
    const prev = points[Math.max(0, i - 1)]!;
    const next = points[Math.min(points.length - 1, i + 1)]!;
    return frameAlong(point, normalize(sub(next, prev)));
  });
}

function bounds(parts: readonly FramePart[]) {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const { mesh } of parts) {
    for (let i = 0; i < mesh.positions.length; i += 3) {
      for (let axis = 0; axis < 3; axis += 1) {
        const value = mesh.positions[i + axis]!;
        if (value < min[axis]!) min[axis] = value;
        if (value > max[axis]!) max[axis] = value;
      }
    }
  }
  return { min: min as Vec3, max: max as Vec3 };
}

/**
 * Builds a pair of glasses from real measurements, in millimetres. Origin at
 * the centre of the bridge; x to the viewer's right, y up, z towards the
 * viewer. Temples run back along −z.
 */
export function buildFrameGeometry(input: FrameGeometryInput): FrameGeometry {
  const { lensWidthMm: w, lensHeightMm: h, bridgeMm, templeMm, shape, rimType } = input;
  if ([w, h, bridgeMm, templeMm, input.totalWidthMm].some((value) => !(value > 0))) {
    throw new RangeError('Frame measurements must be positive numbers.');
  }
  const style = styleFor(input.material);
  const nosePads = input.nosePads ?? (input.material === 'metal' || input.material === 'titanium');
  const halfBridge = bridgeMm / 2;
  const cx = halfBridge + w / 2;
  const wrap = (point: Vec3): Vec3 => [
    point[0],
    point[1],
    point[2] - Math.max(0, Math.abs(point[0]) - halfBridge) * Math.tan(WRAP_RADIANS),
  ];

  const outline = lensOutline(shape, w, h);
  const normals = outlineNormals(outline);
  const half: FramePart[] = [];

  // Lens: a gently curved fan from the centre.
  const lens = new MeshBuilder(wrap);
  const centre = lens.vertex([cx, 0, LENS_BULGE_MM]);
  const maxRadius = Math.max(...outline.map(([x, y]) => Math.hypot(x, y)));
  const ring = outline.map(([x, y]) =>
    lens.vertex([cx + x, y, LENS_BULGE_MM * (1 - (Math.hypot(x, y) / maxRadius) ** 2)]),
  );
  ring.forEach((vertex, i) => {
    lens.triangle(centre, vertex, ring[(i + 1) % ring.length]!);
  });
  half.push({ name: 'lens', role: 'lens', mesh: lens.build() });

  // Lens edge: the polished side wall, which outlines rimless lenses.
  const edge = new MeshBuilder(wrap);
  const front = outline.map(([x, y]) => edge.vertex([cx + x, y, 0.3]));
  const back = outline.map(([x, y]) => edge.vertex([cx + x, y, -LENS_EDGE_MM]));
  front.forEach((vertex, i) => {
    const next = (i + 1) % front.length;
    edge.quad(vertex, back[i]!, back[next]!, front[next]!);
  });
  half.push({ name: 'lens-edge', role: 'lens-edge', mesh: edge.build() });

  // Rim.
  const rimWidthAt = (y: number) =>
    shape === 'wayfarer' ? style.rimWidth * (1 + 0.35 * Math.max(0, y / (h / 2))) : style.rimWidth;
  const rimFrame = (i: number, width: number) => {
    const [x, y] = outline[i]!;
    const [nx, ny] = normals[i]!;
    const offset = width / 2 - 0.6; // the lens sits 0.6 mm into the rim groove
    return {
      point: [cx + x + nx * offset, y + ny * offset, 0] as Vec3,
      side: [nx, ny, 0] as Vec3,
      up: [0, 0, 1] as Vec3,
    };
  };
  const indicesWhere = (predicate: (y: number) => boolean) => {
    const selected = outline
      .map((point, i) => (predicate(point[1]) ? i : -1))
      .filter((i) => i >= 0);
    // Rotate so an open arc doesn't wrap around the array end.
    const gap = selected.findIndex((value, k) => k > 0 && value !== (selected[k - 1] ?? 0) + 1);
    return gap > 0 ? [...selected.slice(gap), ...selected.slice(0, gap)] : selected;
  };

  if (shape === 'browline' && rimType !== 'rimless') {
    const browIdx = indicesWhere((y) => y > -h * 0.05);
    const brow = new MeshBuilder(wrap);
    const browWidth = style.rimWidth * 1.6 + 1.5;
    sweep(
      brow,
      browIdx.map((i) => rimFrame(i, browWidth)),
      () => rimProfile({ ...style, round: false }, browWidth, style.rimDepth + 1),
      false,
    );
    half.push({ name: 'rim-brow', role: 'front', mesh: brow.build() });
    const lowerIdx = indicesWhere((y) => y <= -h * 0.05 + 0.5);
    const lower = new MeshBuilder(wrap);
    sweep(
      lower,
      lowerIdx.map((i) => rimFrame(i, 1.2)),
      () => circleProfile(0.6, 8),
      false,
    );
    half.push({ name: 'rim-lower', role: 'metal', mesh: lower.build() });
  } else if (rimType === 'full-rim') {
    const rim = new MeshBuilder(wrap);
    sweep(
      rim,
      outline.map((_, i) => rimFrame(i, rimWidthAt(outline[i]![1]))),
      (i) => rimProfile(style, rimWidthAt(outline[i]![1]), style.rimDepth),
      true,
    );
    half.push({ name: 'rim', role: style.rimRole, mesh: rim.build() });
  } else if (rimType === 'half-rim') {
    const upper = indicesWhere((y) => y > -h * 0.12);
    const rim = new MeshBuilder(wrap);
    sweep(
      rim,
      upper.map((i) => rimFrame(i, style.rimWidth)),
      () => rimProfile(style, style.rimWidth, style.rimDepth),
      false,
    );
    half.push({ name: 'rim', role: style.rimRole, mesh: rim.build() });
  }

  // Hinge point: the outer edge of the rim, in the upper half.
  const hingeY = h * 0.25;
  const outerX =
    cx +
    Math.max(
      ...outline.filter(([, y]) => Math.abs(y - hingeY) < h * 0.15).map(([x]) => x),
      w * 0.45,
    );
  const rimOuter = rimType === 'rimless' ? outerX : outerX + style.rimWidth - 0.6;
  const hingeX = Math.max(input.totalWidthMm / 2, rimOuter + 1.5);

  // End piece: from the rim out to the hinge, turning back.
  const endpiece = new MeshBuilder(wrap);
  const endPath: Vec3[] = [
    [rimOuter - style.rimWidth * 0.6, hingeY, 0],
    [hingeX - 1.5, hingeY, 0],
    [hingeX, hingeY, -1.5],
    [hingeX, hingeY, -4],
  ];
  const endRole: PartRole = rimType === 'rimless' || style.round ? 'metal' : 'front';
  const endThickness = style.round || rimType === 'rimless' ? 2 : style.rimDepth;
  sweep(
    endpiece,
    framesForPath(endPath),
    () => roundedRectProfile(endThickness, style.round ? 2.4 : 5, 0.8),
    false,
  );
  half.push({ name: 'endpiece', role: endRole, mesh: endpiece.build() });

  // Temple: straight back, splaying slightly, then bending down over the ear.
  const hingeZ = wrap([hingeX, hingeY, -4])[2];
  const straight = templeMm * 0.78;
  const steps = 36;
  const templePath: Vec3[] = [];
  let position: Vec3 = [hingeX, hingeY, hingeZ];
  for (let k = 0; k <= steps; k += 1) {
    const s = (k / steps) * templeMm;
    templePath.push(position);
    const bend = s < straight ? 0 : ((s - straight) / (templeMm - straight)) * EAR_BEND_RADIANS;
    const stepLength = templeMm / steps;
    position = [
      position[0] + 2.5 / steps,
      position[1] - Math.sin(bend) * stepLength,
      position[2] - Math.cos(bend) * stepLength,
    ];
  }
  const templeFrames = framesForPath(templePath);
  const temple = new MeshBuilder();
  if (style.metalTemples) {
    sweep(temple, templeFrames, () => circleProfile(0.8, 8), false);
    half.push({ name: 'temple', role: 'metal', mesh: temple.build() });
    const tip = new MeshBuilder();
    const tipStart = Math.floor(steps * 0.66);
    sweep(
      tip,
      templeFrames.slice(tipStart),
      (i) => roundedRectProfile(2.6, 3.8 - (i / (steps - tipStart)) * 0.6, 1.2),
      false,
    );
    half.push({ name: 'temple-tip', role: 'temple', mesh: tip.build() });
  } else {
    sweep(temple, templeFrames, (i) => roundedRectProfile(2.4, 5 - (i / steps) * 1.4, 0.9), false);
    half.push({ name: 'temple', role: 'temple', mesh: temple.build() });
  }

  if (nosePads) {
    const pad = new MeshBuilder(wrap);
    ellipsoid(pad, [halfBridge + 2.2, -h * 0.22, -4.5], [1.3, 5.5, 3.4]);
    half.push({ name: 'nose-pad', role: 'pad', mesh: pad.build() });
  }

  // Mirror the right half to make the left.
  const parts: FramePart[] = [];
  for (const part of half) {
    parts.push(
      { ...part, name: `${part.name}-right` },
      { ...part, name: `${part.name}-left`, mesh: mirrorX(part.mesh) },
    );
  }

  // Bridge, built whole because it spans both sides.
  const bridgeY = shape === 'aviator' ? h * 0.28 : h * 0.32;
  const reach = rimType === 'rimless' ? 0.5 : style.rimWidth * 0.5;
  const bridgePath: Vec3[] = Array.from({ length: 13 }, (_, k) => {
    const t = k / 12;
    const x = (t - 0.5) * 2 * (halfBridge + reach);
    const arch = (style.round || rimType === 'rimless' ? 3 : 1.5) * Math.sin(Math.PI * t);
    return [x, bridgeY + arch, style.round ? -0.5 : 0];
  });
  const bridge = new MeshBuilder();
  const acetateBridge = !style.round && rimType !== 'rimless';
  sweep(
    bridge,
    framesForPath(bridgePath),
    () =>
      acetateBridge
        ? roundedRectProfile(style.rimDepth, style.rimWidth * 1.3, 1)
        : circleProfile(0.9, 8),
    false,
  );
  parts.push({ name: 'bridge', role: acetateBridge ? 'front' : 'metal', mesh: bridge.build() });

  if (shape === 'aviator') {
    const topBar = new MeshBuilder(wrap);
    const barHalf = halfBridge + w * 0.35;
    const barPath: Vec3[] = Array.from({ length: 11 }, (_, k) => {
      const t = k / 10;
      return [(t - 0.5) * 2 * barHalf, h * 0.47 - 0.8 * Math.sin(Math.PI * t), 0];
    });
    sweep(topBar, framesForPath(barPath), () => circleProfile(0.75, 8), false);
    parts.push({ name: 'brow-bar', role: 'metal', mesh: topBar.build() });
  }

  const hinge: Vec3 = [hingeX, hingeY, hingeZ];
  return {
    parts,
    bounds: bounds(parts),
    anchors: {
      bridgeCentre: [0, bridgeY, 0],
      lensCentres: [
        [-cx, 0, 0],
        [cx, 0, 0],
      ],
      hinges: [[-hinge[0], hinge[1], hinge[2]], hinge],
    },
  };
}
