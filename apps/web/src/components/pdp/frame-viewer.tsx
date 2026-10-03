/* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex -- the canvas is a custom widget (role="application") with its own key handling */
'use client';

import type { FrameSpec, VariantDetail } from '@optical/shared/catalog';
import { OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { Minus, Plus, RotateCcw, RotateCw, Undo2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, type ComponentRef, type KeyboardEvent } from 'react';
import { NeutralToneMapping } from 'three';
import { cn } from '@/lib/cn';
import { Glasses, StudioEnvironment, StudioLights } from './frame-scene';

const ROTATE_STEP = Math.PI / 12;
const ZOOM_STEP = 1.15;

/**
 * Interactive 3D view of the frame, built from the same parametric geometry
 * as the product photos. Drag or use the buttons to turn it; scroll, pinch or
 * use the buttons to zoom. Keyboard: arrow keys turn, + and − zoom, 0 resets.
 */
export default function FrameViewer({
  frame,
  variant,
  name,
  reducedMotion,
}: {
  frame: FrameSpec;
  variant: VariantDetail;
  name: string;
  reducedMotion: boolean;
}) {
  const t = useTranslations('pdp.viewer');
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const distance = frame.totalWidthMm * 2.6;

  const act = (action: 'left' | 'right' | 'up' | 'down' | 'in' | 'out' | 'reset') => {
    const current = controls.current;
    if (!current) return;
    if (action === 'reset') current.reset();
    else if (action === 'left')
      current.setAzimuthalAngle(current.getAzimuthalAngle() - ROTATE_STEP);
    else if (action === 'right')
      current.setAzimuthalAngle(current.getAzimuthalAngle() + ROTATE_STEP);
    else if (action === 'up') current.setPolarAngle(current.getPolarAngle() - ROTATE_STEP);
    else if (action === 'down') current.setPolarAngle(current.getPolarAngle() + ROTATE_STEP);
    else if (action === 'in') current.dollyIn(ZOOM_STEP);
    else current.dollyOut(ZOOM_STEP);
    current.update();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys: Record<string, Parameters<typeof act>[0]> = {
      ArrowLeft: 'left',
      ArrowRight: 'right',
      ArrowUp: 'up',
      ArrowDown: 'down',
      '+': 'in',
      '=': 'in',
      '-': 'out',
      '0': 'reset',
      Home: 'reset',
    };
    const action = keys[event.key];
    if (!action) return;
    event.preventDefault();
    act(action);
  };

  const buttonClass =
    'inline-flex size-11 items-center justify-center rounded-pill bg-surface/90 text-ink ring-1 ring-hairline backdrop-blur transition-colors duration-micro ease-standard hover:bg-surface';

  return (
    <div className="relative size-full">
      <div
        role="application"
        aria-roledescription={t('roleDescription')}
        aria-label={t('label', { name, colour: variant.colourName })}
        aria-describedby="frame-viewer-help"
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="size-full cursor-grab touch-none rounded-media focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:cursor-grabbing"
      >
        <Canvas
          dpr={[1, 2]}
          camera={{
            fov: 30,
            near: 1,
            far: 5000,
            position: [distance * 0.35, distance * 0.12, distance * 0.93],
          }}
          gl={{ antialias: true, alpha: true }}
          scene={{ environmentIntensity: 0.7 }}
          onCreated={({ gl }) => {
            gl.toneMapping = NeutralToneMapping;
            gl.toneMappingExposure = 0.9;
          }}
          fallback={<p className="p-6 text-ink-secondary">{t('unsupported')}</p>}
        >
          <StudioEnvironment />
          <StudioLights />
          <Glasses key={variant.id} frame={frame} variant={variant} />
          <OrbitControls
            ref={controls}
            makeDefault
            enablePan={false}
            enableDamping={!reducedMotion}
            minDistance={distance * 0.45}
            maxDistance={distance * 1.6}
            minPolarAngle={Math.PI * 0.2}
            maxPolarAngle={Math.PI * 0.8}
          />
        </Canvas>
      </div>
      <p id="frame-viewer-help" className="sr-only">
        {t('keyboardHelp')}
      </p>
      <div
        className="absolute inset-x-0 bottom-3 flex justify-center gap-2"
        role="toolbar"
        aria-label={t('controls')}
      >
        {(
          [
            ['left', RotateCcw, t('rotateLeft')],
            ['right', RotateCw, t('rotateRight')],
            ['out', Minus, t('zoomOut')],
            ['in', Plus, t('zoomIn')],
            ['reset', Undo2, t('reset')],
          ] as const
        ).map(([action, Icon, label]) => (
          <button
            key={action}
            type="button"
            className={cn(buttonClass)}
            aria-label={label}
            title={label}
            onClick={() => {
              act(action);
            }}
          >
            <Icon aria-hidden="true" className="size-4.5" strokeWidth={1.5} />
          </button>
        ))}
      </div>
    </div>
  );
}
