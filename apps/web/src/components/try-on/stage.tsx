'use client';

import { useTranslations } from 'next-intl';
import { useRef, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import { cn } from '@/lib/cn';

/** The draggable divider of the split comparison (a slider for keyboards and screen readers). */
function Divider({
  value,
  onChange,
  label,
  description,
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
  description: string;
}) {
  const clamp = (next: number) => Math.min(0.95, Math.max(0.05, next));
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 0.1 : 0.05;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') onChange(clamp(value - step));
    else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') onChange(clamp(value + step));
    else if (event.key === 'Home') onChange(0.05);
    else if (event.key === 'End') onChange(0.95);
    else return;
    event.preventDefault();
  };
  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-describedby="try-on-divider-hint"
      aria-valuemin={5}
      aria-valuemax={95}
      aria-valuenow={Math.round(value * 100)}
      aria-valuetext={`${Math.round(value * 100)}%`}
      onKeyDown={onKeyDown}
      className="absolute inset-y-0 z-10 -ml-5 flex w-10 cursor-ew-resize justify-center focus-visible:outline-2 focus-visible:outline-accent"
      style={{ left: `${value * 100}%` }}
    >
      <span id="try-on-divider-hint" className="sr-only">
        {description}
      </span>
      <span aria-hidden="true" className="h-full w-0.5 bg-white/90 shadow" />
      <span
        aria-hidden="true"
        className="absolute top-1/2 size-9 -translate-y-1/2 rounded-pill border-2 border-white bg-ink/60 backdrop-blur"
      />
    </div>
  );
}

/**
 * The camera image (or photo) with the glasses canvas on top, sized to the
 * image's own aspect ratio so the comparison divider lines up exactly.
 */
export function Stage({
  videoRef,
  canvasRef,
  photoUrl,
  aspect,
  mirrored,
  label,
  split,
  onSplit,
  compareLabels,
  status,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  photoUrl: string | null;
  aspect: number;
  mirrored: boolean;
  label: string;
  split: number | null;
  onSplit: (value: number) => void;
  compareLabels: { left: string; right: string } | null;
  status: string | null;
}) {
  const t = useTranslations('tryOn');
  const stage = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const fromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const box = stage.current?.getBoundingClientRect();
    if (!box) return;
    onSplit(Math.min(0.95, Math.max(0.05, (event.clientX - box.left) / box.width)));
  };
  return (
    <div
      ref={stage}
      className="relative mx-auto touch-none overflow-hidden rounded-media bg-ink"
      // As wide as fits, but never taller than 70% of the screen, at the image's own shape.
      style={{ aspectRatio: String(aspect), width: `min(100%, calc(70dvh * ${aspect}))` }}
      onPointerDown={(event) => {
        if (split === null) return;
        dragging.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        fromPointer(event);
      }}
      onPointerMove={(event) => {
        if (dragging.current) fromPointer(event);
      }}
      onPointerUp={() => {
        dragging.current = false;
      }}
    >
      <div
        role="img"
        aria-label={label}
        className={cn('absolute inset-0', mirrored && '-scale-x-100')}
      >
        <video
          ref={videoRef}
          aria-hidden="true"
          muted
          playsInline
          className={cn('absolute inset-0 size-full object-contain', photoUrl && 'invisible')}
        />
        {photoUrl ? (
          // A local blob URL of the customer's own photo: next/image can't optimise it, and must not.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt="" className="absolute inset-0 size-full object-contain" />
        ) : null}
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          className="absolute inset-0 size-full object-contain"
        />
      </div>
      {split !== null && compareLabels ? (
        <>
          <Divider
            value={split}
            onChange={onSplit}
            label={t('divider')}
            description={t('compareHint', compareLabels)}
          />
          <span className="absolute top-3 left-3 rounded-pill bg-ink/60 px-2.5 py-1 text-caption text-white backdrop-blur">
            {compareLabels.left}
          </span>
          <span className="absolute top-3 right-3 rounded-pill bg-ink/60 px-2.5 py-1 text-caption text-white backdrop-blur">
            {compareLabels.right}
          </span>
        </>
      ) : null}
      {status ? (
        <p
          aria-live="polite"
          className="absolute inset-x-3 bottom-3 mx-auto w-fit max-w-[calc(100%-1.5rem)] rounded-pill bg-ink/65 px-3 py-1.5 text-center text-caption text-white backdrop-blur"
        >
          {status}
        </p>
      ) : null}
    </div>
  );
}
