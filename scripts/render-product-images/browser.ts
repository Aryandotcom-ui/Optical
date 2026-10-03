/**
 * Runs inside headless Chromium. Builds the procedural frame with three.js
 * and returns a PNG data URL per requested view. Bundled by esbuild in
 * index.ts; exposes `window.renderFrame`.
 */
import {
  buildFrameGeometry,
  materialFor,
  patternColours,
  type FrameGeometryInput,
  type MaterialInput,
} from '@optical/shared/frame-geometry';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export type View = 'front' | 'angle' | 'side';

export interface RenderJob {
  frame: FrameGeometryInput;
  material: MaterialInput;
  view: View;
  width: number;
  height: number;
}

declare global {
  interface Window {
    renderFrame: (job: RenderJob) => string;
  }
}

const canvas = document.createElement('canvas');
document.body.appendChild(canvas);
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
  preserveDrawingBuffer: true,
});
renderer.setPixelRatio(1);
renderer.setClearColor(0x000000, 0);
// Khronos PBR Neutral keeps product colours true (ACES shifts and desaturates them).
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 0.9;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.7;

const key = new THREE.DirectionalLight(0xffffff, 1.6);
key.position.set(120, 220, 260);
const rim = new THREE.DirectionalLight(0xffffff, 0.8);
rim.position.set(-200, 120, -180);
scene.add(key, rim, new THREE.AmbientLight(0xffffff, 0.25));

const camera = new THREE.PerspectiveCamera(20, 4 / 3, 1, 5000);

/** Soft elliptical contact shadow, drawn once. */
function shadowTexture(): THREE.CanvasTexture {
  const size = 256;
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = size;
  shadowCanvas.height = size;
  const context = shadowCanvas.getContext('2d');
  if (!context) throw new Error('2D canvas unavailable');
  const gradient = context.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  gradient.addColorStop(0, 'rgba(0,0,0,0.3)');
  gradient.addColorStop(0.5, 'rgba(0,0,0,0.1)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(shadowCanvas);
}
const shadowMaterial = new THREE.MeshBasicMaterial({
  map: shadowTexture(),
  transparent: true,
  depthWrite: false,
});

let current: THREE.Group | null = null;

function buildGroup(job: RenderJob): THREE.Group {
  const geometry = buildFrameGeometry(job.frame);
  const group = new THREE.Group();
  const yRange = [geometry.bounds.min[1], geometry.bounds.max[1]] as const;

  for (const part of geometry.parts) {
    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute('position', new THREE.BufferAttribute(part.mesh.positions, 3));
    buffer.setAttribute('normal', new THREE.BufferAttribute(part.mesh.normals, 3));
    buffer.setIndex(new THREE.BufferAttribute(part.mesh.indices, 1));
    const preset = materialFor(part.role, job.material);
    const glass = part.role === 'lens' || part.role === 'lens-edge';
    const colours = patternColours(part.mesh.positions, preset, yRange);
    if (colours) buffer.setAttribute('color', new THREE.BufferAttribute(colours, 3));

    const material = new THREE.MeshPhysicalMaterial({
      color: colours ? 0xffffff : new THREE.Color(preset.color),
      vertexColors: colours !== null,
      roughness: preset.roughness,
      metalness: preset.metalness,
      clearcoat: preset.clearcoat,
      clearcoatRoughness: preset.clearcoatRoughness,
      transparent: preset.opacity < 1,
      opacity: preset.opacity,
      side: glass ? THREE.DoubleSide : THREE.FrontSide,
      depthWrite: !glass,
    });
    const mesh = new THREE.Mesh(buffer, material);
    mesh.renderOrder = glass ? 2 : 1;
    group.add(mesh);
  }
  return group;
}

const viewRotation: Record<View, { y: number; x: number }> = {
  front: { y: 0, x: 0.04 },
  angle: { y: -0.45, x: 0.08 },
  side: { y: -Math.PI / 2 + 0.18, x: 0.06 },
};

window.renderFrame = (job: RenderJob): string => {
  if (current) {
    scene.remove(current);
    current.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        (object.geometry as THREE.BufferGeometry).dispose();
        if (object.material !== shadowMaterial) (object.material as THREE.Material).dispose();
      }
    });
  }
  renderer.setSize(job.width, job.height, false);
  camera.aspect = job.width / job.height;

  const glasses = buildGroup(job);
  const holder = new THREE.Group();
  holder.add(glasses);
  const rotation = viewRotation[job.view];
  glasses.rotation.set(rotation.x, rotation.y, 0);
  glasses.updateMatrixWorld(true);

  // Centre on the visible frame and add a contact shadow under it.
  const box = new THREE.Box3().setFromObject(glasses);
  const centre = box.getCenter(new THREE.Vector3());
  glasses.position.sub(centre);
  const size = box.getSize(new THREE.Vector3());
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(size.x * 0.95, Math.max(size.z, 40) * 0.7),
    shadowMaterial,
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0, -size.y / 2 - 1.5, -size.z * 0.15);
  holder.add(shadow);
  scene.add(holder);
  current = holder;

  // Fit the silhouette in view with a margin; distance is measured from the
  // nearest point of the frame, so long temples don't shrink the shot.
  const margin = 1.12;
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
  const nearestZ = box.max.z - centre.z;
  const distance =
    Math.max(
      (size.y * margin) / 2 / Math.tan(vFov / 2),
      (size.x * margin) / 2 / Math.tan(hFov / 2),
    ) + nearestZ;
  camera.position.set(0, distance * Math.sin(0.1), distance * Math.cos(0.1));
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();

  renderer.render(scene, camera);
  return canvas.toDataURL('image/png');
};
