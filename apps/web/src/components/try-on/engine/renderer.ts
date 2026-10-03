import type { HeadPose } from '@optical/shared/face';
import {
  AmbientLight,
  CanvasTexture,
  DirectionalLight,
  Group,
  Mesh,
  MeshBasicMaterial,
  NeutralToneMapping,
  OrthographicCamera,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  type Texture,
  WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { disposeGroup } from './glasses';

/** Render quality steps, highest first: pixel ratio, then the contact shadow. */
export const QUALITY_LEVELS = [
  { pixelRatio: 1, shadow: true },
  { pixelRatio: 0.75, shadow: true },
  { pixelRatio: 0.5, shadow: false },
] as const;

/** A head, roughly, in millimetres relative to the glasses: hides temples behind it. */
const HEAD = { radiusY: 115, radiusZ: 100, centreZ: -105, centreY: -15 };

function shadowTexture(): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  if (context) {
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(0,0,0,0.55)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
  }
  return new CanvasTexture(canvas);
}

/** One pair of glasses on the face: a pose holder, the frame, the occluder and a shadow. */
class Slot {
  readonly holder = new Group();
  readonly occluder: Mesh;
  readonly shadow: Mesh;
  glasses: Group | null = null;
  key: string | null = null;

  constructor(shadowMap: Texture) {
    this.holder.visible = false;
    this.occluder = new Mesh(
      new SphereGeometry(1, 32, 24),
      new MeshBasicMaterial({ colorWrite: false }),
    );
    // Drawn first, so the head's depth hides anything behind it.
    this.occluder.renderOrder = -1;
    this.holder.add(this.occluder);
    this.shadow = new Mesh(
      new PlaneGeometry(26, 12),
      new MeshBasicMaterial({ map: shadowMap, transparent: true, depthWrite: false }),
    );
    // Under the nose pads, just behind the lenses.
    this.shadow.position.set(0, -6, -9);
    this.shadow.renderOrder = 0;
    this.holder.add(this.shadow);
  }

  setGlasses(key: string, glasses: Group): void {
    if (this.glasses) {
      this.holder.remove(this.glasses);
      disposeGroup(this.glasses);
    }
    this.glasses = glasses;
    this.key = key;
    this.holder.add(glasses);
  }

  clear(): void {
    if (this.glasses) {
      this.holder.remove(this.glasses);
      disposeGroup(this.glasses);
    }
    this.glasses = null;
    this.key = null;
    this.holder.visible = false;
  }

  place(pose: HeadPose): void {
    this.holder.position.set(...pose.position);
    this.holder.quaternion.set(...pose.rotation);
    this.holder.scale.setScalar(pose.pxPerMm);
    const halfWidthMm = pose.faceWidthPx / pose.pxPerMm / 2;
    this.occluder.scale.set(halfWidthMm, HEAD.radiusY, HEAD.radiusZ);
    this.occluder.position.set(0, HEAD.centreY, HEAD.centreZ);
    this.holder.visible = this.glasses !== null;
  }
}

/**
 * Draws glasses over the camera image. The scene is in image pixels
 * (orthographic, origin at the centre, y up), so a pose from the face
 * landmarks maps straight onto it. Two slots allow a split comparison.
 */
export class TryOnRenderer {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, -5000, 5000);
  private readonly shadowMap = shadowTexture();
  readonly slots: [Slot, Slot];
  private width = 1;
  private height = 1;
  private quality = 0;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = NeutralToneMapping;
    this.renderer.outputColorSpace = SRGBColorSpace;
    const pmrem = new PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    const key = new DirectionalLight(0xffffff, 1.4);
    key.position.set(200, 300, 600);
    this.scene.add(key, new AmbientLight(0xffffff, 0.35));
    this.slots = [new Slot(this.shadowMap), new Slot(this.shadowMap)];
    for (const slot of this.slots) this.scene.add(slot.holder);
  }

  /** Matches the scene to the camera image size. */
  setSize(width: number, height: number): void {
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.camera.left = -width / 2;
    this.camera.right = width / 2;
    this.camera.top = height / 2;
    this.camera.bottom = -height / 2;
    this.camera.updateProjectionMatrix();
    this.applyQuality();
  }

  get qualityLevel(): number {
    return this.quality;
  }

  /** Steps down one quality level; returns false when already at the lowest. */
  degrade(): boolean {
    if (this.quality >= QUALITY_LEVELS.length - 1) return false;
    this.quality += 1;
    this.applyQuality();
    return true;
  }

  private applyQuality(): void {
    const level = QUALITY_LEVELS[this.quality] ?? QUALITY_LEVELS[0];
    const ratio = Math.min(window.devicePixelRatio || 1, 2) * level.pixelRatio;
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(this.width, this.height, false);
    for (const slot of this.slots) slot.shadow.visible = level.shadow;
  }

  hide(): void {
    for (const slot of this.slots) slot.holder.visible = false;
  }

  /**
   * Draws the frame; with `split` (0–1 across the image) the primary pair
   * is drawn left of the divider and the comparison pair right of it.
   */
  render(split: number | null = null): void {
    const [primary, compare] = this.slots;
    const compareShown = compare.holder.visible;
    if (split === null || !compare.glasses) {
      compare.holder.visible = false;
      this.renderer.setScissorTest(false);
      this.renderer.render(this.scene, this.camera);
      compare.holder.visible = compareShown;
      return;
    }
    const primaryShown = primary.holder.visible;
    const divider = Math.round(this.width * split);
    this.renderer.setScissorTest(true);
    this.renderer.clear();
    this.renderer.autoClear = false;
    compare.holder.visible = false;
    this.renderer.setScissor(0, 0, divider, this.height);
    this.renderer.setViewport(0, 0, this.width, this.height);
    this.renderer.render(this.scene, this.camera);
    compare.holder.visible = compareShown;
    primary.holder.visible = false;
    this.renderer.setScissor(divider, 0, this.width - divider, this.height);
    this.renderer.render(this.scene, this.camera);
    primary.holder.visible = primaryShown;
    this.renderer.autoClear = true;
    this.renderer.setScissorTest(false);
  }

  /**
   * A PNG of the camera image with the glasses, as seen on screen
   * (mirrored or not), optionally with the brand in the corner. Made in
   * this tab and handed straight to the browser's download; never uploaded.
   */
  async snapshot(
    source: HTMLVideoElement | HTMLImageElement,
    options: { mirrored: boolean; watermark: string | null; split: number | null },
  ): Promise<Blob | null> {
    const output = document.createElement('canvas');
    output.width = this.width;
    output.height = this.height;
    const context = output.getContext('2d');
    if (!context) return null;
    context.save();
    if (options.mirrored) {
      context.translate(this.width, 0);
      context.scale(-1, 1);
    }
    context.drawImage(source, 0, 0, this.width, this.height);
    // Read the WebGL canvas in the same task as the render, before it is cleared.
    this.render(options.split);
    context.drawImage(this.canvas, 0, 0, this.width, this.height);
    context.restore();
    if (options.watermark) {
      const size = Math.round(this.height / 22);
      context.font = `600 ${size}px system-ui, sans-serif`;
      context.fillStyle = 'rgba(255,255,255,0.85)';
      context.textAlign = 'right';
      context.fillText(options.watermark, this.width - size, this.height - size);
    }
    return new Promise((resolve) => {
      output.toBlob(resolve, 'image/png');
    });
  }

  dispose(): void {
    for (const slot of this.slots) {
      if (slot.glasses) disposeGroup(slot.glasses);
      slot.occluder.geometry.dispose();
      slot.shadow.geometry.dispose();
    }
    this.shadowMap.dispose();
    this.scene.environment?.dispose();
    this.renderer.dispose();
  }
}
