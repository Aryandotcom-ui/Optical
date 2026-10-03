import {
  alignQuaternion,
  faceWidthMm,
  headPose,
  measureFace,
  normalizeQuaternion,
  OneEuroVector,
  type HeadPose,
  type Quaternion,
} from '@optical/shared/face';
import type { Delegate, FaceFrame, FaceTracker } from './tracker';
import type { TryOnRenderer } from './renderer';

export interface LoopStats {
  /** Tracked and drawn frames per second, over the last second. */
  fps: number;
  /** A face is being tracked now. */
  tracking: boolean;
  /** The picture is dark or tracking keeps dropping: suggest more light. */
  lowLight: boolean;
  quality: number;
  delegate: Delegate;
  /** Smoothed face width, for the fit hint. */
  faceWidthMm: number | null;
}

export interface LoopOptions {
  video: HTMLVideoElement;
  tracker: FaceTracker;
  renderer: TryOnRenderer;
  /** The customer's PD when known, for faithful scale. */
  pdMm: () => number | undefined;
  /** Divider position for split comparison, or null. */
  split: () => number | null;
  onStats: (stats: LoopStats) => void;
  /** Every tracked frame, for tools that measure (debug page, face shape, PD). */
  onFace?: (frame: FaceFrame, pose: HeadPose) => void;
}

/** Frames without a face before the glasses are hidden (about a quarter second). */
const LOST_AFTER = 8;
/** Below this many frames per second for three seconds, quality steps down. */
const DEGRADE_BELOW_FPS = 20;
const DARK_LUMA = 55;

/**
 * The try-on loop: for each new camera frame, track the face, smooth the
 * pose (One-Euro), place and draw the glasses, and keep an eye on speed
 * and light. Nothing leaves the tab.
 */
export class TryOnLoop {
  private running = false;
  private handle = 0;
  private readonly position = new OneEuroVector(3, {
    minCutoff: 1.5,
    beta: 0.01,
    derivativeCutoff: 1,
  });
  private readonly rotation = new OneEuroVector(4, {
    minCutoff: 1.5,
    beta: 0.4,
    derivativeCutoff: 1,
  });
  private readonly scale = new OneEuroVector(1, {
    minCutoff: 0.8,
    beta: 0.002,
    derivativeCutoff: 1,
  });
  private previousRotation: Quaternion = [0, 0, 0, 1];
  private missed = 0;
  private frames = 0;
  private windowStart = 0;
  private slowWindows = 0;
  private fps = 0;
  private recent: boolean[] = [];
  private dark = false;
  private width: number | null = null;
  private readonly probe = document.createElement('canvas');
  private startedAt = 0;

  constructor(private readonly options: LoopOptions) {
    this.probe.width = 32;
    this.probe.height = 18;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.startedAt = performance.now();
    this.windowStart = this.startedAt;
    this.schedule();
  }

  stop(): void {
    this.running = false;
    const video = this.options.video;
    if ('cancelVideoFrameCallback' in video) video.cancelVideoFrameCallback(this.handle);
    cancelAnimationFrame(this.handle);
  }

  private schedule(): void {
    if (!this.running) return;
    const video = this.options.video;
    const next = () => void this.tick();
    this.handle =
      'requestVideoFrameCallback' in video
        ? video.requestVideoFrameCallback(next)
        : requestAnimationFrame(next);
  }

  private smooth(pose: HeadPose, now: number): HeadPose {
    const aligned = alignQuaternion(pose.rotation, this.previousRotation);
    const rotation = normalizeQuaternion(this.rotation.filter(aligned, now) as Quaternion);
    this.previousRotation = rotation;
    const [x = 0, y = 0, z = 0] = this.position.filter(pose.position, now);
    const [pxPerMm = pose.pxPerMm] = this.scale.filter([pose.pxPerMm], now);
    return { ...pose, position: [x, y, z], rotation, pxPerMm };
  }

  private checkLight(): void {
    const context = this.probe.getContext('2d', { willReadFrequently: true });
    if (!context) return;
    context.drawImage(this.options.video, 0, 0, 32, 18);
    const data = context.getImageData(0, 0, 32, 18).data;
    let sum = 0;
    for (let index = 0; index < data.length; index += 4)
      sum +=
        0.2126 * (data[index] ?? 0) +
        0.7152 * (data[index + 1] ?? 0) +
        0.0722 * (data[index + 2] ?? 0);
    this.dark = sum / (data.length / 4) < DARK_LUMA;
  }

  private async tick(): Promise<void> {
    if (!this.running) return;
    const { video, tracker, renderer } = this.options;
    if (document.hidden || video.readyState < 2) {
      this.schedule();
      return;
    }
    const now = performance.now();
    renderer.setSize(video.videoWidth, video.videoHeight);
    const frame = await tracker.detectVideo(video, now);
    if (frame) {
      this.missed = 0;
      const pdMm = this.options.pdMm();
      const raw = headPose(frame.landmarks, video.videoWidth, video.videoHeight, {
        matrix: frame.matrix,
        ...(pdMm ? { pdMm } : {}),
      });
      const pose = this.smooth(raw, now);
      for (const slot of renderer.slots) slot.place(pose);
      const width = faceWidthMm(
        measureFace(frame.landmarks, video.videoWidth, video.videoHeight),
        pdMm,
      );
      this.width = this.width === null ? width : this.width * 0.9 + width * 0.1;
      this.options.onFace?.(frame, pose);
    } else {
      this.missed += 1;
      if (this.missed >= LOST_AFTER) {
        renderer.hide();
        this.position.reset();
        this.rotation.reset();
        this.scale.reset();
      }
    }
    renderer.render(this.options.split());

    this.recent.push(frame !== null);
    if (this.recent.length > 30) this.recent.shift();
    this.frames += 1;
    if (this.frames % 30 === 0) this.checkLight();
    if (now - this.windowStart >= 1000) {
      this.fps = Math.round((this.frames * 1000) / (now - this.windowStart));
      this.frames = 0;
      this.windowStart = now;
      // Give the GPU three seconds to warm up before judging speed.
      if (now - this.startedAt > 3000) {
        this.slowWindows = this.fps < DEGRADE_BELOW_FPS ? this.slowWindows + 1 : 0;
        if (this.slowWindows >= 3 && renderer.degrade()) this.slowWindows = 0;
      }
      const found = this.recent.filter(Boolean).length / this.recent.length;
      this.options.onStats({
        fps: this.fps,
        tracking: this.missed < LOST_AFTER,
        lowLight: this.dark || (found > 0 && found < 0.5),
        quality: renderer.qualityLevel,
        delegate: tracker.delegate,
        faceWidthMm: this.missed < LOST_AFTER && this.width ? Math.round(this.width) : null,
      });
    }
    this.schedule();
  }
}
