import {
  FacePoints,
  LANDMARK,
  add3,
  cross3,
  distance3,
  dot3,
  mid3,
  normalize3,
  scale3,
  sub3,
  type NormalizedPoint,
  type Point3,
} from './landmarks';
import { AVERAGE_PD_MM } from './measure';

/** Rotation as a unit quaternion [x, y, z, w]. */
export type Quaternion = [number, number, number, number];

/**
 * Where to draw a pair of glasses, in scene space (pixels, y up, z
 * towards the camera): the point between the lens centres, the head's
 * rotation, and the scale in pixels per millimetre.
 */
export interface HeadPose {
  position: Point3;
  rotation: Quaternion;
  pxPerMm: number;
  /** Cheekbone width in pixels, for the head occluder. */
  faceWidthPx: number;
}

/** Lenses sit about 12 mm in front of the eye (the vertex distance). */
export const VERTEX_DISTANCE_MM = 12;

/** Quaternion from an orthonormal basis given as its three columns. */
export function quaternionFromBasis(x: Point3, y: Point3, z: Point3): Quaternion {
  const [m00, m10, m20] = x;
  const [m01, m11, m21] = y;
  const [m02, m12, m22] = z;
  const trace = m00 + m11 + m22;
  let q: Quaternion;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    q = [(m21 - m12) * s, (m02 - m20) * s, (m10 - m01) * s, 0.25 / s];
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    q = [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    q = [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s];
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    q = [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s];
  }
  return normalizeQuaternion(q);
}

export function normalizeQuaternion(q: Quaternion): Quaternion {
  const length = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / length, q[1] / length, q[2] / length, q[3] / length];
}

/** Angle between two rotations, in degrees. */
export function quaternionAngle(a: Quaternion, b: Quaternion): number {
  const d = Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]));
  return (2 * Math.acos(d) * 180) / Math.PI;
}

/** Flips `q` to the same hemisphere as `reference`, so filtering never takes the long way round. */
export function alignQuaternion(q: Quaternion, reference: Quaternion): Quaternion {
  const d = q[0] * reference[0] + q[1] * reference[1] + q[2] * reference[2] + q[3] * reference[3];
  return d < 0 ? [-q[0], -q[1], -q[2], -q[3]] : q;
}

/**
 * Head rotation from the landmarks: x along the eye line (to the image
 * right), y from chin to forehead, z out of the face towards the camera.
 */
export function landmarkBasis(face: FacePoints): [Point3, Point3, Point3] {
  const x = normalize3(sub3(face.at(LANDMARK.leftEyeOuter), face.at(LANDMARK.rightEyeOuter)));
  const up = sub3(face.at(LANDMARK.foreheadTop), face.at(LANDMARK.chin));
  const y = normalize3(sub3(up, scale3(x, dot3(up, x))));
  return [x, y, cross3(x, y)];
}

/**
 * Head rotation from MediaPipe's facial transformation matrix (column
 * major, OpenGL camera space: x right, y up, z towards the camera), with
 * scale removed.
 */
export function matrixBasis(matrix: readonly number[]): [Point3, Point3, Point3] | null {
  if (matrix.length !== 16) return null;
  const column = (index: number): Point3 =>
    normalize3([matrix[index * 4] ?? 0, matrix[index * 4 + 1] ?? 0, matrix[index * 4 + 2] ?? 0]);
  const x = column(0);
  const y0 = column(1);
  const y = normalize3(sub3(y0, scale3(x, dot3(y0, x))));
  const z = cross3(x, y);
  return [x, y, z];
}

/**
 * The full 6-DoF pose for the glasses. Rotation comes from the
 * transformation matrix when MediaPipe provides one and it agrees with the
 * landmarks (within 25°); otherwise from the landmarks alone. Size comes
 * from the pupils: the customer's PD (or the average) over the same
 * distance in pixels, so frames appear at their real width.
 */
export function headPose(
  landmarks: readonly NormalizedPoint[],
  width: number,
  height: number,
  options: { matrix?: readonly number[] | null; pdMm?: number } = {},
): HeadPose {
  const face = new FacePoints(landmarks, width, height);
  const fromLandmarks = quaternionFromBasis(...landmarkBasis(face));
  const basis = options.matrix ? matrixBasis(options.matrix) : null;
  const fromMatrix = basis ? quaternionFromBasis(...basis) : null;
  const rotation =
    fromMatrix && quaternionAngle(fromMatrix, fromLandmarks) <= 25 ? fromMatrix : fromLandmarks;

  const right = face.at(LANDMARK.rightIris);
  const left = face.at(LANDMARK.leftIris);
  const pupils = distance3(right, left);
  const pxPerMm = pupils / (options.pdMm ?? AVERAGE_PD_MM);
  const [, , z] = landmarkBasis(face);
  const position = add3(mid3(right, left), scale3(z, VERTEX_DISTANCE_MM * pxPerMm));
  return {
    position,
    rotation,
    pxPerMm,
    faceWidthPx: distance3(face.at(LANDMARK.rightCheek), face.at(LANDMARK.leftCheek)),
  };
}

/**
 * How far the face is turned from the camera, in degrees. With MediaPipe's
 * transformation matrix this is the full turn (yaw and pitch, measured
 * from the canonical face, so a front-on face reads 0). Without it, only
 * the yaw from the eye line: the landmark basis leans back with the
 * forehead, so its pitch isn't a fair test of looking straight ahead.
 * Measuring tools only use frames that face the camera.
 */
export function turnFromCamera(
  landmarks: readonly NormalizedPoint[],
  width: number,
  height: number,
  matrix: readonly number[] | null = null,
): number {
  const basis = matrix ? matrixBasis(matrix) : null;
  const degrees = (radians: number) => (radians * 180) / Math.PI;
  if (basis) return degrees(Math.acos(Math.min(1, Math.abs(basis[2][2]))));
  const [x] = landmarkBasis(new FacePoints(landmarks, width, height));
  return degrees(Math.asin(Math.min(1, Math.abs(x[2]))));
}
