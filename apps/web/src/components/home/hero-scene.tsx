'use client';

import type { FrameSpec, VariantDetail } from '@optical/shared/catalog';
import { Canvas, useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { NeutralToneMapping, type Group } from 'three';
import { Glasses, StudioEnvironment, StudioLights } from '@/components/pdp/frame-scene';

function Turntable({
  frame,
  variant,
  playing,
}: {
  frame: FrameSpec;
  variant: VariantDetail;
  playing: boolean;
}) {
  const group = useRef<Group>(null);
  const elapsed = useRef(0);
  useFrame((_, delta) => {
    if (!group.current || !playing) return;
    elapsed.current += delta;
    // A slow sway rather than a full spin: the front always stays readable.
    group.current.rotation.y = Math.sin(elapsed.current * 0.35) * 0.55;
  });
  return (
    <group ref={group}>
      <Glasses frame={frame} variant={variant} />
    </group>
  );
}

/** Decorative 3D version of the hero frame. The static photo stays the LCP element. */
export default function HeroScene({
  frame,
  variant,
  playing,
  onReady,
}: {
  frame: FrameSpec;
  variant: VariantDetail;
  playing: boolean;
  onReady: () => void;
}) {
  // Far enough back that the temples stay in frame as it sways.
  const distance = frame.totalWidthMm * 3.1;
  return (
    <Canvas
      dpr={[1, 2]}
      frameloop={playing ? 'always' : 'demand'}
      camera={{ fov: 30, near: 1, far: 5000, position: [0, distance * 0.1, distance] }}
      gl={{ antialias: true, alpha: true }}
      scene={{ environmentIntensity: 0.7 }}
      onCreated={({ gl }) => {
        gl.toneMapping = NeutralToneMapping;
        gl.toneMappingExposure = 0.9;
        requestAnimationFrame(() => {
          onReady();
        });
      }}
    >
      <StudioEnvironment />
      <StudioLights />
      <Turntable frame={frame} variant={variant} playing={playing} />
    </Canvas>
  );
}
