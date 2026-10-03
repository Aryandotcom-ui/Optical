import { FacePoints, LANDMARK, distance3, type NormalizedPoint } from './landmarks';

/** Average adult interpupillary distance, used when the customer's own PD is unknown. */
export const AVERAGE_PD_MM = 63;
/** Average horizontal visible iris diameter (HVID) of adults. */
export const AVERAGE_IRIS_MM = 11.7;

/** Face proportions in scene pixels, measured in 3D so a turned head doesn't skew them. */
export interface FaceMeasurements {
  foreheadWidth: number;
  cheekWidth: number;
  jawWidth: number;
  faceLength: number;
  pupilDistance: number;
  irisDiameter: number;
}

export function measureFace(
  landmarks: readonly NormalizedPoint[],
  width: number,
  height: number,
): FaceMeasurements {
  const face = new FacePoints(landmarks, width, height);
  const span = (a: number, b: number) => distance3(face.at(a), face.at(b));
  return {
    foreheadWidth: span(LANDMARK.rightForehead, LANDMARK.leftForehead),
    cheekWidth: span(LANDMARK.rightCheek, LANDMARK.leftCheek),
    jawWidth: span(LANDMARK.rightJaw, LANDMARK.leftJaw),
    faceLength: span(LANDMARK.foreheadTop, LANDMARK.chin),
    pupilDistance: span(LANDMARK.rightIris, LANDMARK.leftIris),
    irisDiameter:
      (face.irisDiameter(LANDMARK.rightIrisRing) + face.irisDiameter(LANDMARK.leftIrisRing)) / 2,
  };
}

/**
 * Face width in millimetres, scaled by the pupils: the known (or average)
 * PD in mm against the same distance in pixels.
 */
export function faceWidthMm(measurements: FaceMeasurements, pdMm = AVERAGE_PD_MM): number {
  if (measurements.pupilDistance <= 0) return 0;
  return (measurements.cheekWidth * pdMm) / measurements.pupilDistance;
}

export type FrameFit = 'narrow' | 'good' | 'wide';

/** A frame's total width sits this far inside the cheekbone width when it fits well. */
export const IDEAL_FRAME_INSET_MM = 4;
/** Within this many mm of the ideal counts as a good fit. */
export const FIT_TOLERANCE_MM = 6;

/**
 * Whether a frame suits the face width: "runs slightly wide" when the
 * frame is noticeably wider than the face, "narrow" when it is smaller.
 */
export function frameFit(
  frameTotalWidthMm: number,
  faceWidth: number,
): { fit: FrameFit; differenceMm: number } {
  const differenceMm = Math.round(frameTotalWidthMm - (faceWidth - IDEAL_FRAME_INSET_MM));
  if (differenceMm > FIT_TOLERANCE_MM) return { fit: 'wide', differenceMm };
  if (differenceMm < -FIT_TOLERANCE_MM) return { fit: 'narrow', differenceMm };
  return { fit: 'good', differenceMm };
}
