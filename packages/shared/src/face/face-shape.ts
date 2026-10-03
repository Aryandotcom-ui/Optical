import type { FaceShape } from '../catalog/constants';
import type { FaceMeasurements } from './measure';

/** Proportions relative to cheekbone width: face length, forehead width and jaw width. */
export interface FaceRatios {
  length: number;
  forehead: number;
  jaw: number;
}

export interface FaceShapeResult {
  shape: FaceShape;
  /** Share of the evidence for the winning shape, 0 to 1. */
  confidence: number;
  ratios: FaceRatios;
  /** Every shape's share, highest first, so the UI can show the runner-up. */
  scores: { shape: FaceShape; score: number }[];
}

/**
 * Typical proportions of each face shape, measured on MediaPipe's mesh
 * (landmark 10, the top of the mesh on the forehead, to the chin for
 * length; landmarks 54–284, 234–454 and 172–397 for the widths). Because
 * the mesh stops below the hairline, lengths read shorter than tape-measure
 * guides suggest. A face is assigned the shape whose prototype it is
 * closest to, weighting length most, since it varies most between shapes.
 */
export const FACE_SHAPE_PROTOTYPES: Record<FaceShape, FaceRatios> = {
  oval: { length: 1.28, forehead: 0.86, jaw: 0.8 },
  round: { length: 1.14, forehead: 0.86, jaw: 0.84 },
  square: { length: 1.18, forehead: 0.9, jaw: 0.9 },
  heart: { length: 1.25, forehead: 0.92, jaw: 0.74 },
  oblong: { length: 1.44, forehead: 0.88, jaw: 0.84 },
  diamond: { length: 1.26, forehead: 0.78, jaw: 0.75 },
};

const WEIGHTS: FaceRatios = { length: 1, forehead: 1.6, jaw: 1.6 };
/** How quickly evidence falls off with distance from a prototype. */
const SHARPNESS = 120;

export function faceRatios(measurements: FaceMeasurements): FaceRatios {
  const base = measurements.cheekWidth || 1;
  return {
    length: measurements.faceLength / base,
    forehead: measurements.foreheadWidth / base,
    jaw: measurements.jawWidth / base,
  };
}

/** Classifies proportions into one of six face shapes, with a confidence. */
export function classifyFaceShape(ratios: FaceRatios): FaceShapeResult {
  const raw = (Object.keys(FACE_SHAPE_PROTOTYPES) as FaceShape[]).map((shape) => {
    const prototype = FACE_SHAPE_PROTOTYPES[shape];
    const distance =
      WEIGHTS.length * (ratios.length - prototype.length) ** 2 +
      WEIGHTS.forehead * (ratios.forehead - prototype.forehead) ** 2 +
      WEIGHTS.jaw * (ratios.jaw - prototype.jaw) ** 2;
    return { shape, weight: Math.exp(-SHARPNESS * distance) };
  });
  const total = raw.reduce((sum, entry) => sum + entry.weight, 0) || 1;
  const scores = raw
    .map((entry) => ({ shape: entry.shape, score: entry.weight / total }))
    .sort((a, b) => b.score - a.score);
  const best = scores[0] ?? { shape: 'oval' as const, score: 0 };
  return { shape: best.shape, confidence: best.score, ratios, scores };
}

/** Averages several frames' ratios before classifying, for a steadier answer. */
export function averageRatios(samples: readonly FaceRatios[]): FaceRatios | null {
  if (samples.length === 0) return null;
  const sum = samples.reduce(
    (total, sample) => ({
      length: total.length + sample.length,
      forehead: total.forehead + sample.forehead,
      jaw: total.jaw + sample.jaw,
    }),
    { length: 0, forehead: 0, jaw: 0 },
  );
  return {
    length: sum.length / samples.length,
    forehead: sum.forehead / samples.length,
    jaw: sum.jaw / samples.length,
  };
}
