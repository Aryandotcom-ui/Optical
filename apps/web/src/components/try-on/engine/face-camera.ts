import { CameraError, openCamera, stopCamera } from './camera';
import { FaceTracker, type FaceFrame } from './tracker';

export type FaceCameraProblem = CameraError['problem'] | 'tracker';

/**
 * The camera and face tracker for the measuring tools (face shape, PD).
 * Each camera frame's landmarks go to `onFrame` in this tab; nothing is
 * drawn, uploaded or kept. Stops itself when the tab is hidden.
 */
export class FaceCamera {
  private stream: MediaStream | null = null;
  private tracker: FaceTracker | null = null;
  private running = false;
  private handle = 0;

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly onFrame: (frame: FaceFrame | null) => void,
    private readonly onHidden: () => void,
  ) {}

  /** Opens the camera and loads the tracker; rejects with the problem to show. */
  async start(): Promise<void> {
    const [camera, tracker] = await Promise.allSettled([
      openCamera(this.video),
      FaceTracker.create('VIDEO'),
    ]);
    if (camera.status === 'fulfilled') this.stream = camera.value;
    if (tracker.status === 'fulfilled') this.tracker = tracker.value;
    if (camera.status === 'rejected' || tracker.status === 'rejected') {
      this.stop();
      const reason: unknown = camera.status === 'rejected' ? camera.reason : null;
      throw new FaceCameraError(reason instanceof CameraError ? reason.problem : 'tracker');
    }
    this.running = true;
    document.addEventListener('visibilitychange', this.onVisibility);
    this.schedule();
  }

  private readonly onVisibility = () => {
    if (!document.hidden) return;
    this.stop();
    this.onHidden();
  };

  private schedule(): void {
    if (!this.running) return;
    const next = () => void this.tick();
    this.handle =
      'requestVideoFrameCallback' in this.video
        ? this.video.requestVideoFrameCallback(next)
        : requestAnimationFrame(next);
  }

  private async tick(): Promise<void> {
    const tracker = this.tracker;
    if (!this.running || !tracker) return;
    if (this.video.readyState >= 2) {
      let frame: FaceFrame | null = null;
      try {
        frame = await tracker.detectVideo(this.video, performance.now());
      } catch {
        // Stopped mid-detection (the tracker is closed); otherwise skip this frame.
      }
      // stop() may have run while the tracker was busy.
      if (this.tracker !== tracker) return;
      this.onFrame(frame);
    }
    this.schedule();
  }

  /** The current camera image, for a still to mark up (kept in memory only). */
  still(canvas: HTMLCanvasElement): boolean {
    const { videoWidth: width, videoHeight: height } = this.video;
    if (!width || !height) return false;
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return false;
    context.drawImage(this.video, 0, 0, width, height);
    return true;
  }

  get size(): { width: number; height: number } {
    return { width: this.video.videoWidth, height: this.video.videoHeight };
  }

  stop(): void {
    this.running = false;
    document.removeEventListener('visibilitychange', this.onVisibility);
    if ('cancelVideoFrameCallback' in this.video) this.video.cancelVideoFrameCallback(this.handle);
    cancelAnimationFrame(this.handle);
    stopCamera(this.stream, this.video);
    this.stream = null;
    this.tracker?.close();
    this.tracker = null;
  }
}

export class FaceCameraError extends Error {
  override name = 'FaceCameraError';
  constructor(readonly problem: FaceCameraProblem) {
    super(`Face camera unavailable: ${problem}`);
  }
}
