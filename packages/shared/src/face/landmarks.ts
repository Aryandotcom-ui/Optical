/**
 * MediaPipe Face Landmarker indices (478-point mesh with irises) and
 * conversion to a scene space: pixels, origin at the image centre, x to
 * the right, y up, z towards the camera. "Right" and "left" name the
 * person's own sides (their right eye appears on the image's left).
 */
export const LANDMARK = {
  foreheadTop: 10,
  chin: 152,
  noseBridge: 168,
  noseTip: 1,
  rightEyeOuter: 33,
  leftEyeOuter: 263,
  rightCheek: 234,
  leftCheek: 454,
  rightForehead: 54,
  leftForehead: 284,
  rightJaw: 172,
  leftJaw: 397,
  rightIris: 468,
  leftIris: 473,
  /** Ring points around each iris (centre + 4 around in the mesh). */
  rightIrisRing: [469, 470, 471, 472],
  leftIrisRing: [474, 475, 476, 477],
} as const;

export const LANDMARK_COUNT = 478;

export interface NormalizedPoint {
  x: number;
  y: number;
  z: number;
}

export type Point3 = [number, number, number];

/** MediaPipe's z is in the same normalised units as x (image width). */
export function toScene(point: NormalizedPoint, width: number, height: number): Point3 {
  return [(point.x - 0.5) * width, (0.5 - point.y) * height, -point.z * width];
}

export const sub3 = (a: Point3, b: Point3): Point3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add3 = (a: Point3, b: Point3): Point3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scale3 = (a: Point3, s: number): Point3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot3 = (a: Point3, b: Point3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross3 = (a: Point3, b: Point3): Point3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const length3 = (a: Point3) => Math.hypot(a[0], a[1], a[2]);
export const distance3 = (a: Point3, b: Point3) => length3(sub3(a, b));
export const mid3 = (a: Point3, b: Point3): Point3 => scale3(add3(a, b), 0.5);
export function normalize3(a: Point3): Point3 {
  const length = length3(a);
  return length === 0 ? [0, 0, 0] : scale3(a, 1 / length);
}

/** The landmarks a frame needs, in scene space. */
export class FacePoints {
  constructor(
    private readonly points: readonly NormalizedPoint[],
    readonly width: number,
    readonly height: number,
  ) {
    if (points.length < LANDMARK_COUNT)
      throw new Error(`Expected ${LANDMARK_COUNT} landmarks, got ${points.length}`);
  }

  at(index: number): Point3 {
    const point = this.points[index];
    if (!point) throw new Error(`Missing landmark ${index}`);
    return toScene(point, this.width, this.height);
  }

  /** Mean diameter of an iris ring, in scene pixels. */
  irisDiameter(ring: readonly number[]): number {
    const [a, b, c, d] = ring.map((index) => this.at(index));
    if (!a || !b || !c || !d) return 0;
    return (distance3(a, c) + distance3(b, d)) / 2;
  }
}
