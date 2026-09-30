/**
 * Minimal mesh building blocks: an indexed triangle mesh, smooth normals,
 * profile sweeps and ellipsoids. Plain typed arrays, so any renderer
 * (three.js, a GLB exporter, a test) can consume them.
 */
export type Vec2 = readonly [number, number];
export type Vec3 = readonly [number, number, number];

export interface MeshData {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
}

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const length = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
export function normalize(a: Vec3): Vec3 {
  const len = length(a);
  return len === 0 ? [0, 0, 0] : scale(a, 1 / len);
}

export class MeshBuilder {
  private readonly positions: number[] = [];
  private readonly indices: number[] = [];

  /** `transform` is applied to every vertex as it is added (e.g. frame wrap). */
  constructor(private readonly transform: (point: Vec3) => Vec3 = (point) => point) {}

  get vertexCount(): number {
    return this.positions.length / 3;
  }

  vertex(input: Vec3): number {
    const point = this.transform(input);
    this.positions.push(point[0], point[1], point[2]);
    return this.vertexCount - 1;
  }

  triangle(a: number, b: number, c: number): void {
    this.indices.push(a, b, c);
  }

  /** Quad a-b-c-d, counter-clockwise when seen from the front. */
  quad(a: number, b: number, c: number, d: number): void {
    this.triangle(a, b, c);
    this.triangle(a, c, d);
  }

  build(): MeshData {
    const positions = new Float32Array(this.positions);
    const indices = new Uint32Array(this.indices);
    return { positions, indices, normals: computeVertexNormals(positions, indices) };
  }
}

/** Area-weighted smooth vertex normals. */
export function computeVertexNormals(positions: Float32Array, indices: Uint32Array): Float32Array {
  const normals = new Float32Array(positions.length);
  const at = (index: number): Vec3 => [
    positions[index * 3]!,
    positions[index * 3 + 1]!,
    positions[index * 3 + 2]!,
  ];
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = [indices[i]!, indices[i + 1]!, indices[i + 2]!];
    const face = cross(sub(at(b), at(a)), sub(at(c), at(a)));
    for (const vertex of [a, b, c]) {
      normals[vertex * 3] = normals[vertex * 3]! + face[0];
      normals[vertex * 3 + 1] = normals[vertex * 3 + 1]! + face[1];
      normals[vertex * 3 + 2] = normals[vertex * 3 + 2]! + face[2];
    }
  }
  for (let v = 0; v < normals.length; v += 3) {
    const n = normalize([normals[v]!, normals[v + 1]!, normals[v + 2]!]);
    // Degenerate vertices get a forward-facing normal rather than NaN.
    const safe: Vec3 = length(n) === 0 ? [0, 0, 1] : n;
    normals.set(safe, v);
  }
  return normals;
}

/**
 * Sweeps a closed 2D profile along a path. Each path point carries its own
 * frame (`side`, `up`), so callers control twist exactly. Open paths get
 * flat end caps.
 */
export function sweep(
  mesh: MeshBuilder,
  path: readonly { point: Vec3; side: Vec3; up: Vec3 }[],
  profile: (pathIndex: number) => readonly Vec2[],
  closed: boolean,
): void {
  const rings: number[][] = path.map((frame, index) =>
    profile(index).map(([u, v]) =>
      mesh.vertex(add(frame.point, add(scale(frame.side, u), scale(frame.up, v)))),
    ),
  );
  const segments = closed ? rings.length : rings.length - 1;
  for (let i = 0; i < segments; i += 1) {
    const current = rings[i]!;
    const next = rings[(i + 1) % rings.length]!;
    for (let j = 0; j < current.length; j += 1) {
      const k = (j + 1) % current.length;
      mesh.quad(current[j]!, current[k]!, next[k]!, next[j]!);
    }
  }
  if (!closed) {
    capRing(mesh, rings[0]!, true);
    capRing(mesh, rings.at(-1)!, false);
  }
}

function capRing(mesh: MeshBuilder, ring: readonly number[], reverse: boolean) {
  for (let j = 1; j < ring.length - 1; j += 1) {
    if (reverse) mesh.triangle(ring[0]!, ring[j + 1]!, ring[j]!);
    else mesh.triangle(ring[0]!, ring[j]!, ring[j + 1]!);
  }
}

/** Rounded-rectangle profile of the given width and height, centred on the origin. */
export function roundedRectProfile(
  width: number,
  height: number,
  radius: number,
  segmentsPerCorner = 3,
): Vec2[] {
  const r = Math.min(radius, width / 2, height / 2);
  const hw = width / 2 - r;
  const hh = height / 2 - r;
  const corners: Vec2[] = [
    [hw, hh],
    [-hw, hh],
    [-hw, -hh],
    [hw, -hh],
  ];
  const points: Vec2[] = [];
  corners.forEach(([cx, cy], corner) => {
    for (let s = 0; s <= segmentsPerCorner; s += 1) {
      const angle = (corner * Math.PI) / 2 + (s / segmentsPerCorner) * (Math.PI / 2);
      points.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
    }
  });
  return points;
}

export function circleProfile(radius: number, segments = 10): Vec2[] {
  return Array.from({ length: segments }, (_, i) => {
    const angle = (i / segments) * Math.PI * 2;
    return [radius * Math.cos(angle), radius * Math.sin(angle)] as const;
  });
}

export function ellipsoid(
  mesh: MeshBuilder,
  centre: Vec3,
  radii: Vec3,
  rings = 8,
  segments = 12,
): void {
  const grid: number[][] = [];
  for (let i = 0; i <= rings; i += 1) {
    const phi = (i / rings) * Math.PI;
    const row: number[] = [];
    for (let j = 0; j < segments; j += 1) {
      const theta = (j / segments) * Math.PI * 2;
      row.push(
        mesh.vertex([
          centre[0] + radii[0] * Math.sin(phi) * Math.cos(theta),
          centre[1] + radii[1] * Math.cos(phi),
          centre[2] + radii[2] * Math.sin(phi) * Math.sin(theta),
        ]),
      );
    }
    grid.push(row);
  }
  for (let i = 0; i < rings; i += 1) {
    for (let j = 0; j < segments; j += 1) {
      const k = (j + 1) % segments;
      mesh.quad(grid[i]![j]!, grid[i]![k]!, grid[i + 1]![k]!, grid[i + 1]![j]!);
    }
  }
}

/** Mirrors a mesh across the x = 0 plane, flipping winding so faces still point outwards. */
export function mirrorX(mesh: MeshData): MeshData {
  const positions = mesh.positions.slice();
  const normals = mesh.normals.slice();
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] = -positions[i]!;
    normals[i] = -normals[i]!;
  }
  const indices = mesh.indices.slice();
  for (let i = 0; i < indices.length; i += 3) {
    const b = indices[i + 1]!;
    indices[i + 1] = indices[i + 2]!;
    indices[i + 2] = b;
  }
  return { positions, normals, indices };
}
