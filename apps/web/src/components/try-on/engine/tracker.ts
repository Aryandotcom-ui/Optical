import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import type { NormalizedPoint } from '@optical/shared/face';

/** Served from this site (see scripts/copy-mediapipe.mjs): no CDN, works offline. */
const WASM_PATH = '/mediapipe/wasm';
const MODEL_PATH = '/mediapipe/face_landmarker.task';

export interface FaceFrame {
  landmarks: NormalizedPoint[];
  /** Column-major 4×4 facial transformation matrix, when available. */
  matrix: number[] | null;
}

export type Delegate = 'GPU' | 'CPU';

/**
 * True when WebGL runs on a software renderer (SwiftShader, llvmpipe):
 * there the CPU delegate (XNNPACK) is several times faster than "GPU".
 */
function softwareGl(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return true;
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
    return /swiftshader|llvmpipe|software/i.test(renderer);
  } catch {
    return false;
  }
}

async function create(delegate: Delegate, mode: 'VIDEO' | 'IMAGE'): Promise<FaceLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
  return FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL_PATH, delegate },
    runningMode: mode,
    numFaces: 1,
    outputFacialTransformationMatrixes: true,
    outputFaceBlendshapes: false,
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
}

const toFrame = (result: ReturnType<FaceLandmarker['detect']>): FaceFrame | null => {
  const landmarks = result.faceLandmarks[0];
  if (!landmarks) return null;
  return { landmarks, matrix: result.facialTransformationMatrixes[0]?.data ?? null };
};

/**
 * MediaPipe Face Landmarker (478 points with irises), entirely in this
 * tab. Uses the GPU delegate (the CPU one on software-rendered WebGL) and
 * falls back to the CPU if the GPU can't start or fails while running.
 */
export class FaceTracker {
  private mode: 'VIDEO' | 'IMAGE';
  private lastTimestamp = 0;

  private constructor(
    private landmarker: FaceLandmarker,
    public delegate: Delegate,
    mode: 'VIDEO' | 'IMAGE',
  ) {
    this.mode = mode;
  }

  static async create(mode: 'VIDEO' | 'IMAGE' = 'VIDEO'): Promise<FaceTracker> {
    if (softwareGl()) return new FaceTracker(await create('CPU', mode), 'CPU', mode);
    try {
      return new FaceTracker(await create('GPU', mode), 'GPU', mode);
    } catch {
      return new FaceTracker(await create('CPU', mode), 'CPU', mode);
    }
  }

  private async fallBackToCpu(): Promise<void> {
    this.landmarker.close();
    this.landmarker = await create('CPU', this.mode);
    this.delegate = 'CPU';
  }

  private async setMode(mode: 'VIDEO' | 'IMAGE'): Promise<void> {
    if (this.mode === mode) return;
    await this.landmarker.setOptions({ runningMode: mode });
    this.mode = mode;
  }

  /** One video frame. Timestamps must increase, so equal ones are nudged forward. */
  async detectVideo(video: HTMLVideoElement, timeMs: number): Promise<FaceFrame | null> {
    await this.setMode('VIDEO');
    const timestamp = Math.max(timeMs, this.lastTimestamp + 1);
    this.lastTimestamp = timestamp;
    try {
      return toFrame(this.landmarker.detectForVideo(video, timestamp));
    } catch (error) {
      if (this.delegate === 'CPU') throw error;
      await this.fallBackToCpu();
      return null;
    }
  }

  /** A still photo (the upload mode). */
  async detectImage(image: HTMLImageElement | HTMLCanvasElement): Promise<FaceFrame | null> {
    await this.setMode('IMAGE');
    try {
      return toFrame(this.landmarker.detect(image));
    } catch (error) {
      if (this.delegate === 'CPU') throw error;
      await this.fallBackToCpu();
      await this.setMode('IMAGE');
      return toFrame(this.landmarker.detect(image));
    }
  }

  close(): void {
    this.landmarker.close();
  }
}
