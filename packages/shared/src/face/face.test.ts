import { describe, expect, it } from 'vitest';
import {
  CARD_WIDTH_MM,
  classifyFaceShape,
  faceRatios,
  faceWidthMm,
  FACE_SHAPE_PROTOTYPES,
  frameFit,
  headPose,
  LANDMARK,
  LANDMARK_COUNT,
  measureFace,
  medianReading,
  OneEuroFilter,
  OneEuroVector,
  pdFromCard,
  pdFromIris,
  quaternionAngle,
  quaternionFromBasis,
  turnFromCamera,
  type NormalizedPoint,
  type Quaternion,
} from './index';

const WIDTH = 1280;
const HEIGHT = 720;

/** Key points of a face in millimetres (x to the image right, y up, z towards the camera). */
const FACE_MM: Record<number, [number, number, number]> = {
  [LANDMARK.foreheadTop]: [0, 95, 5],
  [LANDMARK.chin]: [0, -95, 5],
  [LANDMARK.noseBridge]: [0, 2, 18],
  [LANDMARK.noseTip]: [0, -30, 30],
  [LANDMARK.rightEyeOuter]: [-45, 0, 5],
  [LANDMARK.leftEyeOuter]: [45, 0, 5],
  [LANDMARK.rightCheek]: [-70, -5, -20],
  [LANDMARK.leftCheek]: [70, -5, -20],
  [LANDMARK.rightForehead]: [-60, 55, -5],
  [LANDMARK.leftForehead]: [60, 55, -5],
  [LANDMARK.rightJaw]: [-56, -60, -20],
  [LANDMARK.leftJaw]: [56, -60, -20],
  [LANDMARK.rightIris]: [-31.5, 0, 12],
  [LANDMARK.leftIris]: [31.5, 0, 12],
};
for (const [ring, centre] of [
  [LANDMARK.rightIrisRing, -31.5],
  [LANDMARK.leftIrisRing, 31.5],
] as const) {
  const r = 5.85;
  const offsets: [number, number][] = [
    [r, 0],
    [0, r],
    [-r, 0],
    [0, -r],
  ];
  ring.forEach((index, i) => {
    const [dx, dy] = offsets[i] ?? [0, 0];
    FACE_MM[index] = [centre + dx, dy, 12];
  });
}

function rotateY(point: [number, number, number], degrees: number): [number, number, number] {
  const a = (degrees * Math.PI) / 180;
  return [
    point[0] * Math.cos(a) + point[2] * Math.sin(a),
    point[1],
    -point[0] * Math.sin(a) + point[2] * Math.cos(a),
  ];
}

/** Projects the face (orthographically) into MediaPipe's normalised image coordinates. */
function syntheticLandmarks(
  options: { pxPerMm?: number; yawDegrees?: number; scale?: Partial<Record<number, number>> } = {},
): NormalizedPoint[] {
  const pxPerMm = options.pxPerMm ?? 3;
  const points: NormalizedPoint[] = Array.from({ length: LANDMARK_COUNT }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0,
  }));
  for (const [key, value] of Object.entries(FACE_MM)) {
    const factor = options.scale?.[Number(key)] ?? 1;
    const [x, y, z] = rotateY([value[0] * factor, value[1], value[2]], options.yawDegrees ?? 0);
    points[Number(key)] = {
      x: 0.5 + (x * pxPerMm) / WIDTH,
      y: 0.5 - (y * pxPerMm) / HEIGHT,
      z: -(z * pxPerMm) / WIDTH,
    };
  }
  return points;
}

describe('One-Euro filter', () => {
  it('passes the first value and settles on a constant input', () => {
    const filter = new OneEuroFilter();
    expect(filter.filter(10, 0)).toBe(10);
    let value = 0;
    for (let t = 33; t < 3000; t += 33) value = filter.filter(20, t);
    expect(value).toBeCloseTo(20, 1);
  });

  it('smooths jitter while holding still', () => {
    const filter = new OneEuroFilter();
    const outputs: number[] = [];
    for (let i = 0; i < 60; i += 1) outputs.push(filter.filter(100 + (i % 2 ? 2 : -2), i * 33));
    const tail = outputs.slice(30);
    expect(Math.max(...tail) - Math.min(...tail)).toBeLessThan(1.5);
  });

  it('follows fast movement with little lag', () => {
    const slow = new OneEuroFilter({ minCutoff: 1, beta: 0, derivativeCutoff: 1 });
    const adaptive = new OneEuroFilter({ minCutoff: 1, beta: 0.05, derivativeCutoff: 1 });
    let a = 0;
    let b = 0;
    for (let i = 0; i <= 10; i += 1) {
      a = slow.filter(i * 40, i * 33);
      b = adaptive.filter(i * 40, i * 33);
    }
    expect(400 - b).toBeLessThan(400 - a);
  });

  it('ignores repeated timestamps and filters vectors per component', () => {
    const filter = new OneEuroFilter();
    filter.filter(1, 100);
    expect(filter.filter(50, 100)).toBe(1);
    filter.reset();
    expect(filter.filter(7, 0)).toBe(7);
    const vector = new OneEuroVector(3);
    expect(vector.filter([1, 2, 3], 0)).toEqual([1, 2, 3]);
    vector.reset();
  });
});

describe('measurements and pose', () => {
  it('measures the face and recovers its width in millimetres from the pupils', () => {
    const m = measureFace(syntheticLandmarks(), WIDTH, HEIGHT);
    expect(m.pupilDistance).toBeCloseTo(63 * 3, 5);
    expect(m.irisDiameter).toBeCloseTo(11.7 * 3, 5);
    expect(faceWidthMm(m)).toBeCloseTo(140, 5);
    expect(faceWidthMm(m, 60)).toBeCloseTo((140 * 60) / 63, 5);
    expect(faceWidthMm({ ...m, pupilDistance: 0 })).toBe(0);
  });

  it('finds scale and a frontal pose, with lenses in front of the eyes', () => {
    const pose = headPose(syntheticLandmarks({ pxPerMm: 4 }), WIDTH, HEIGHT);
    expect(pose.pxPerMm).toBeCloseTo(4, 5);
    expect(quaternionAngle(pose.rotation, [0, 0, 0, 1])).toBeLessThan(0.5);
    expect(pose.position[0]).toBeCloseTo(0, 5);
    expect(pose.position[2]).toBeCloseTo((12 + 12) * 4, 5);
    expect(pose.faceWidthPx).toBeCloseTo(140 * 4, 5);
  });

  it('recovers a turned head, and uses the PD it is given', () => {
    const pose = headPose(syntheticLandmarks({ yawDegrees: 25 }), WIDTH, HEIGHT, { pdMm: 60 });
    const expected = quaternionFromBasis(
      [Math.cos((25 * Math.PI) / 180), 0, -Math.sin((25 * Math.PI) / 180)],
      [0, 1, 0],
      [Math.sin((25 * Math.PI) / 180), 0, Math.cos((25 * Math.PI) / 180)],
    );
    expect(quaternionAngle(pose.rotation, expected)).toBeLessThan(1);
    expect(pose.pxPerMm).toBeCloseTo((63 * 3) / 60, 5);
  });

  it('reports how far the face is turned from the camera', () => {
    expect(turnFromCamera(syntheticLandmarks(), WIDTH, HEIGHT)).toBeLessThan(0.5);
    expect(turnFromCamera(syntheticLandmarks({ yawDegrees: 20 }), WIDTH, HEIGHT)).toBeCloseTo(
      20,
      0,
    );
    // A pitched matrix counts too; landmarks alone only see yaw.
    const pitched = (degrees: number) => {
      const a = (degrees * Math.PI) / 180;
      return [
        1,
        0,
        0,
        0,
        0,
        Math.cos(a),
        Math.sin(a),
        0,
        0,
        -Math.sin(a),
        Math.cos(a),
        0,
        0,
        0,
        -50,
        1,
      ];
    };
    expect(turnFromCamera(syntheticLandmarks(), WIDTH, HEIGHT, pitched(15))).toBeCloseTo(15, 3);
    expect(turnFromCamera(syntheticLandmarks(), WIDTH, HEIGHT, [1, 2])).toBeLessThan(0.5);
  });

  it('prefers a transformation matrix that agrees with the landmarks, and ignores one that does not', () => {
    const landmarks = syntheticLandmarks();
    const turned = (degrees: number) => {
      const a = (degrees * Math.PI) / 180;
      // Column-major 4x4 with scale 2, rotation about y.
      return [
        2 * Math.cos(a),
        0,
        -2 * Math.sin(a),
        0,
        0,
        2,
        0,
        0,
        2 * Math.sin(a),
        0,
        2 * Math.cos(a),
        0,
        0,
        0,
        -50,
        1,
      ];
    };
    const agreeing = headPose(landmarks, WIDTH, HEIGHT, { matrix: turned(10) });
    expect(quaternionAngle(agreeing.rotation, [0, 0, 0, 1])).toBeCloseTo(10, 1);
    const wild = headPose(landmarks, WIDTH, HEIGHT, { matrix: turned(90) });
    expect(quaternionAngle(wild.rotation, [0, 0, 0, 1])).toBeLessThan(0.5);
    const malformed = headPose(landmarks, WIDTH, HEIGHT, { matrix: [1, 2, 3] });
    expect(quaternionAngle(malformed.rotation, [0, 0, 0, 1])).toBeLessThan(0.5);
  });

  it('builds unit quaternions from any rotation', () => {
    const cases: [number, number, number][][] = [
      [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
      [
        [-1, 0, 0],
        [0, 1, 0],
        [0, 0, -1],
      ],
      [
        [1, 0, 0],
        [0, -1, 0],
        [0, 0, -1],
      ],
      [
        [-1, 0, 0],
        [0, -1, 0],
        [0, 0, 1],
      ],
    ];
    for (const [x, y, z] of cases) {
      const q: Quaternion = quaternionFromBasis(x!, y!, z!);
      expect(Math.hypot(...q)).toBeCloseTo(1, 6);
    }
  });

  it('refuses incomplete landmark sets', () => {
    expect(() => measureFace([{ x: 0, y: 0, z: 0 }], WIDTH, HEIGHT)).toThrow(/478/);
  });
});

describe('face shape', () => {
  it('recognises every prototype as itself, with a confidence', () => {
    for (const [shape, ratios] of Object.entries(FACE_SHAPE_PROTOTYPES)) {
      const result = classifyFaceShape(ratios);
      expect(result.shape).toBe(shape);
      expect(result.confidence).toBeGreaterThan(0.3);
      expect(result.scores.reduce((sum, entry) => sum + entry.score, 0)).toBeCloseTo(1, 6);
    }
  });

  it('reads long faces as oblong and wide-jawed short faces as square', () => {
    expect(classifyFaceShape({ length: 1.62, forehead: 0.88, jaw: 0.84 }).shape).toBe('oblong');
    expect(classifyFaceShape({ length: 1.2, forehead: 0.93, jaw: 0.94 }).shape).toBe('square');
    expect(classifyFaceShape({ length: 1.3, forehead: 0.95, jaw: 0.7 }).shape).toBe('heart');
  });

  it('computes ratios relative to the cheekbones', () => {
    const ratios = faceRatios(measureFace(syntheticLandmarks(), WIDTH, HEIGHT));
    expect(ratios.length).toBeGreaterThan(1.2);
    expect(ratios.jaw).toBeLessThan(1);
  });
});

describe('fit and PD', () => {
  it('says when a frame runs wide or narrow', () => {
    expect(frameFit(136, 140)).toEqual({ fit: 'good', differenceMm: 0 });
    expect(frameFit(146, 140).fit).toBe('wide');
    expect(frameFit(126, 140).fit).toBe('narrow');
  });

  it('measures PD from a card or the iris, rejecting implausible results', () => {
    expect(pdFromCard(189, 3 * CARD_WIDTH_MM)).toBe(63);
    expect(pdFromCard(189, 50)).toBeNull();
    expect(pdFromCard(0, 100)).toBeNull();
    expect(pdFromIris(63 * 3, 11.7 * 3)).toBe(63);
    expect(pdFromIris(10, 0)).toBeNull();
    expect(medianReading([62, null, 63.2, 70, 63])).toBe(63);
    expect(medianReading([62, 63])).toBe(62.5);
    expect(medianReading([null])).toBeNull();
  });
});
