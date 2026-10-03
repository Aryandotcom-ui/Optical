/* eslint-disable react/no-unknown-property -- react-three-fiber elements take three.js props, not DOM attributes */
'use client';

import type { FrameSpec, VariantDetail } from '@optical/shared/catalog';
import {
  buildFrameGeometry,
  materialFor,
  patternColours,
  type FramePart,
} from '@optical/shared/frame-geometry';
import { useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { DoubleSide, FrontSide, PMREMGenerator } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/** Neutral studio lighting generated in code, so the viewer needs no HDR download. */
export function StudioEnvironment() {
  const gl = useThree((state) => state.gl);
  const texture = useMemo(() => {
    const pmrem = new PMREMGenerator(gl);
    const result = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    return result;
  }, [gl]);
  useEffect(
    () => () => {
      texture.dispose();
    },
    [texture],
  );
  return <primitive object={texture} attach="environment" />;
}

function Part({
  part,
  variant,
  yRange,
}: {
  part: FramePart;
  variant: VariantDetail;
  yRange: readonly [number, number];
}) {
  const preset = materialFor(part.role, {
    finish: variant.finish,
    colorHex: variant.swatchHex,
    secondaryHex: variant.secondaryHex,
    ...(variant.hardwareHex ? { hardwareHex: variant.hardwareHex } : {}),
    lensTintHex: variant.lensTintHex,
    lensTintStrength: 0.75,
  });
  const colours = useMemo(
    () => patternColours(part.mesh.positions, preset, yRange),
    [part, preset, yRange],
  );
  const glass = part.role === 'lens' || part.role === 'lens-edge';
  return (
    <mesh renderOrder={glass ? 2 : 1}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[part.mesh.positions, 3]} />
        <bufferAttribute attach="attributes-normal" args={[part.mesh.normals, 3]} />
        {colours ? <bufferAttribute attach="attributes-color" args={[colours, 3]} /> : null}
        <bufferAttribute attach="index" args={[part.mesh.indices, 1]} />
      </bufferGeometry>
      <meshPhysicalMaterial
        color={colours ? '#ffffff' : preset.color}
        vertexColors={colours !== null}
        roughness={preset.roughness}
        metalness={preset.metalness}
        clearcoat={preset.clearcoat}
        clearcoatRoughness={preset.clearcoatRoughness}
        transparent={preset.opacity < 1}
        opacity={preset.opacity}
        side={glass ? DoubleSide : FrontSide}
        depthWrite={!glass}
      />
    </mesh>
  );
}

export function Glasses({ frame, variant }: { frame: FrameSpec; variant: VariantDetail }) {
  const geometry = useMemo(
    () =>
      buildFrameGeometry({
        shape: frame.shape,
        lensWidthMm: frame.lensWidthMm,
        lensHeightMm: frame.lensHeightMm,
        bridgeMm: frame.bridgeMm,
        templeMm: frame.templeMm,
        totalWidthMm: frame.totalWidthMm,
        rimType: frame.rimType,
        material: frame.material,
        nosePads: frame.nosePads,
      }),
    [frame],
  );
  const { min, max } = geometry.bounds;
  const yRange = useMemo(() => [min[1], max[1]] as const, [min, max]);
  const centre: [number, number, number] = [
    -(min[0] + max[0]) / 2,
    -(min[1] + max[1]) / 2,
    -(min[2] + max[2]) / 2,
  ];
  return (
    <group position={centre}>
      {geometry.parts.map((part) => (
        <Part key={part.name} part={part} variant={variant} yRange={yRange} />
      ))}
    </group>
  );
}

/** Key, rim and fill lights matching the product photos. */
export function StudioLights() {
  return (
    <>
      <directionalLight position={[120, 220, 260]} intensity={1.6} />
      <directionalLight position={[-200, 120, -180]} intensity={0.8} />
      <ambientLight intensity={0.25} />
    </>
  );
}
