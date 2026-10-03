import type { FrameSpec, VariantDetail } from '@optical/shared/catalog';
import { buildFrameGeometry, materialFor, patternColours } from '@optical/shared/frame-geometry';
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  FrontSide,
  Group,
  type Material,
  Mesh,
  MeshPhysicalMaterial,
} from 'three';

/**
 * The same parametric frame as the product page's 3D viewer, in
 * millimetres, with its origin midway between the lens centres (which is
 * where the try-on places it, in front of the pupils).
 */
export function buildGlasses(frame: FrameSpec, variant: VariantDetail): Group {
  const geometry = buildFrameGeometry({
    shape: frame.shape,
    lensWidthMm: frame.lensWidthMm,
    lensHeightMm: frame.lensHeightMm,
    bridgeMm: frame.bridgeMm,
    templeMm: frame.templeMm,
    totalWidthMm: frame.totalWidthMm,
    rimType: frame.rimType,
    material: frame.material,
    nosePads: frame.nosePads,
  });
  const yRange = [geometry.bounds.min[1], geometry.bounds.max[1]] as const;
  const group = new Group();
  for (const part of geometry.parts) {
    const preset = materialFor(part.role, {
      finish: variant.finish,
      colorHex: variant.swatchHex,
      secondaryHex: variant.secondaryHex,
      ...(variant.hardwareHex ? { hardwareHex: variant.hardwareHex } : {}),
      lensTintHex: variant.lensTintHex,
      lensTintStrength: 0.75,
    });
    const colours = patternColours(part.mesh.positions, preset, yRange);
    const mesh = new BufferGeometry();
    mesh.setAttribute('position', new BufferAttribute(part.mesh.positions, 3));
    mesh.setAttribute('normal', new BufferAttribute(part.mesh.normals, 3));
    if (colours) mesh.setAttribute('color', new BufferAttribute(colours, 3));
    mesh.setIndex(new BufferAttribute(part.mesh.indices, 1));
    const glass = part.role === 'lens' || part.role === 'lens-edge';
    const material = new MeshPhysicalMaterial({
      color: colours ? '#ffffff' : preset.color,
      vertexColors: colours !== null,
      roughness: preset.roughness,
      metalness: preset.metalness,
      clearcoat: preset.clearcoat,
      clearcoatRoughness: preset.clearcoatRoughness,
      transparent: preset.opacity < 1,
      opacity: preset.opacity,
      side: glass ? DoubleSide : FrontSide,
      depthWrite: !glass,
    });
    const object = new Mesh(mesh, material);
    object.renderOrder = glass ? 3 : 1;
    object.name = part.name;
    group.add(object);
  }
  return group;
}

export function disposeGroup(group: Group): void {
  group.traverse((object) => {
    if (object instanceof Mesh) {
      const mesh = object as Mesh;
      mesh.geometry.dispose();
      const materials: Material[] = ([] as Material[]).concat(mesh.material);
      for (const material of materials) material.dispose();
    }
  });
}
