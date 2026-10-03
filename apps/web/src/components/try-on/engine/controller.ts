import { headPose, type HeadPose } from '@optical/shared/face';
import type { Group } from 'three';
import { CameraError, openCamera, stopCamera, webgl2Available, type CameraProblem } from './camera';
import { TryOnLoop, type LoopStats } from './loop';
import { TryOnRenderer } from './renderer';
import { FaceTracker } from './tracker';

export type TryOnPhase = 'intro' | 'starting' | 'live' | 'photo' | 'error';
export type TryOnProblem = CameraProblem | 'webgl' | 'tracker';

export interface TryOnState {
  phase: TryOnPhase;
  problem: TryOnProblem | null;
  stats: LoopStats | null;
  /** Photo mode: the photo's address (an in-memory blob URL) and whether a face was found. */
  photo: { url: string; face: boolean; aspect: number } | null;
  paused: boolean;
}

export const initialTryOnState: TryOnState = {
  phase: 'intro',
  problem: null,
  stats: null,
  photo: null,
  paused: false,
};

/**
 * Runs a try-on session: camera or photo in, glasses drawn on top. Owns
 * the camera stream, the face tracker, the renderer and the loop, and
 * releases them all on `dispose()`. Camera frames and photos never leave
 * the tab.
 */
export class TryOnController {
  private tracker: FaceTracker | null = null;
  private renderer: TryOnRenderer | null = null;
  private stream: MediaStream | null = null;
  private loop: TryOnLoop | null = null;
  private image: HTMLImageElement | null = null;
  private photoPose: HeadPose | null = null;
  private state: TryOnState = initialTryOnState;
  split: number | null = null;
  pdMm: number | undefined;

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly canvas: HTMLCanvasElement,
    private readonly onState: (state: TryOnState) => void,
    private readonly onFace?: ConstructorParameters<typeof TryOnLoop>[0]['onFace'],
  ) {}

  private set(patch: Partial<TryOnState>): void {
    this.state = { ...this.state, ...patch };
    this.onState(this.state);
  }

  private fail(problem: TryOnProblem): void {
    this.set({ phase: 'error', problem, stats: null });
  }

  /** The renderer and tracker, created once; false (with the problem shown) if impossible. */
  private async engine(): Promise<boolean> {
    if (!this.renderer) {
      if (!webgl2Available()) {
        this.fail('webgl');
        return false;
      }
      try {
        this.renderer = new TryOnRenderer(this.canvas);
      } catch {
        this.fail('webgl');
        return false;
      }
    }
    if (!this.tracker) {
      try {
        this.tracker = await FaceTracker.create('VIDEO');
      } catch {
        this.fail('tracker');
        return false;
      }
    }
    return true;
  }

  async startCamera(): Promise<void> {
    this.clearPhoto();
    this.set({ phase: 'starting', problem: null });
    if (!(await this.engine()) || !this.tracker || !this.renderer) return;
    try {
      this.stream = await openCamera(this.video);
    } catch (error) {
      this.fail(error instanceof CameraError ? error.problem : 'unknown');
      return;
    }
    this.loop = new TryOnLoop({
      video: this.video,
      tracker: this.tracker,
      renderer: this.renderer,
      pdMm: () => this.pdMm,
      split: () => this.split,
      onStats: (stats) => {
        this.set({ stats });
      },
      ...(this.onFace ? { onFace: this.onFace } : {}),
    });
    this.loop.start();
    this.set({ phase: 'live' });
  }

  stopCamera(): void {
    this.loop?.stop();
    this.loop = null;
    stopCamera(this.stream, this.video);
    this.stream = null;
    this.renderer?.hide();
    if (this.state.phase === 'live' || this.state.phase === 'starting')
      this.set({ phase: 'intro', stats: null });
  }

  private clearPhoto(): void {
    if (this.state.photo) URL.revokeObjectURL(this.state.photo.url);
    this.image = null;
    this.photoPose = null;
    if (this.state.photo) this.set({ photo: null });
  }

  /** Photo mode: tracks the face once and draws the glasses on the photo. */
  async usePhoto(file: File): Promise<void> {
    this.stopCamera();
    this.clearPhoto();
    this.set({ phase: 'starting', problem: null });
    if (!(await this.engine()) || !this.tracker || !this.renderer) return;
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
    } catch {
      URL.revokeObjectURL(url);
      this.set({ phase: 'photo', photo: null });
      return;
    }
    this.image = image;
    const frame = await this.tracker.detectImage(image);
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    this.renderer.setSize(width, height);
    this.photoPose = frame
      ? headPose(frame.landmarks, width, height, {
          matrix: frame.matrix,
          ...(this.pdMm ? { pdMm: this.pdMm } : {}),
        })
      : null;
    this.set({ phase: 'photo', photo: { url, face: frame !== null, aspect: width / height } });
    this.redrawPhoto();
  }

  private redrawPhoto(): void {
    if (this.state.phase !== 'photo' || !this.renderer) return;
    if (this.photoPose) for (const slot of this.renderer.slots) slot.place(this.photoPose);
    else this.renderer.hide();
    this.renderer.render(this.split);
  }

  /** Puts a pair of glasses in slot 0 (worn) or 1 (comparison); null removes it. */
  setGlasses(slot: 0 | 1, key: string | null, build: (() => Group) | null): void {
    const target = this.renderer?.slots[slot];
    if (!target) return;
    if (key === null || !build) target.clear();
    else if (target.key !== key) target.setGlasses(key, build());
    this.redrawPhoto();
  }

  setSplit(split: number | null): void {
    this.split = split;
    this.redrawPhoto();
  }

  /** Background tabs don't use the camera: the stream is disabled until the tab returns. */
  setPaused(paused: boolean): void {
    for (const track of this.stream?.getVideoTracks() ?? []) track.enabled = !paused;
    this.set({ paused });
  }

  snapshot(options: { mirrored: boolean; watermark: string | null }): Promise<Blob | null> {
    const source = this.state.phase === 'photo' ? this.image : this.video;
    if (!this.renderer || !source) return Promise.resolve(null);
    return this.renderer.snapshot(source, {
      mirrored: this.state.phase === 'photo' ? false : options.mirrored,
      watermark: options.watermark,
      split: this.split,
    });
  }

  dispose(): void {
    this.stopCamera();
    this.clearPhoto();
    this.tracker?.close();
    this.tracker = null;
    this.renderer?.dispose();
    this.renderer = null;
  }
}
