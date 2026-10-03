/**
 * The front camera, on this device only. Frames go from the camera to a
 * <video> element and the face tracker in this tab; nothing is uploaded,
 * recorded or stored.
 */
export type CameraProblem = 'denied' | 'unavailable' | 'insecure' | 'in-use' | 'unknown';

export class CameraError extends Error {
  override name = 'CameraError';
  constructor(readonly problem: CameraProblem) {
    super(`Camera unavailable: ${problem}`);
  }
}

function classify(error: unknown): CameraProblem {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'unavailable';
  if (name === 'NotReadableError' || name === 'AbortError') return 'in-use';
  return 'unknown';
}

/** Whether the browser can offer a camera here at all (secure page, API present). */
export function cameraSupport(): CameraProblem | null {
  if (typeof window === 'undefined') return 'unavailable';
  if (!window.isSecureContext) return 'insecure';
  if (!('mediaDevices' in navigator) || typeof navigator.mediaDevices.getUserMedia !== 'function')
    return 'unavailable';
  return null;
}

/** Starts the front camera into `video` and resolves once frames are flowing. */
export async function openCamera(video: HTMLVideoElement): Promise<MediaStream> {
  const unsupported = cameraSupport();
  if (unsupported) throw new CameraError(unsupported);
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: 'user',
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 },
      },
    });
  } catch (error) {
    throw new CameraError(classify(error));
  }
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  try {
    await video.play();
  } catch {
    // Autoplay of a muted inline stream is allowed; a failure here is transient.
  }
  if (video.videoWidth === 0)
    await new Promise<void>((resolve) => {
      video.addEventListener(
        'loadeddata',
        () => {
          resolve();
        },
        { once: true },
      );
    });
  return stream;
}

export function stopCamera(stream: MediaStream | null, video?: HTMLVideoElement | null): void {
  for (const track of stream?.getTracks() ?? []) track.stop();
  if (video) video.srcObject = null;
}

/** WebGL2 is needed to draw the glasses; checked before asking for the camera. */
export function webgl2Available(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return canvas.getContext('webgl2') !== null;
  } catch {
    return false;
  }
}
