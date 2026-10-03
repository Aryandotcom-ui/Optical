'use client';

import { useRef, type KeyboardEvent, type PointerEvent } from 'react';

/** One draggable edge marker: a vertical line with a slider handle. */
function Edge({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
}) {
  const clamp = (next: number) => Math.min(1, Math.max(0, next));
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Fine steps by default: a pixel or two matters for a PD reading.
    const step = event.shiftKey ? 0.01 : 0.002;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') onChange(clamp(value - step));
    else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') onChange(clamp(value + step));
    else return;
    event.preventDefault();
  };
  const onPointer = (event: PointerEvent<HTMLDivElement>) => {
    if (event.type === 'pointerdown') event.currentTarget.setPointerCapture(event.pointerId);
    else if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const box = event.currentTarget.parentElement?.getBoundingClientRect();
    if (box && box.width > 0) onChange(clamp((event.clientX - box.left) / box.width));
  };
  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 1000) / 10}
      aria-valuetext={`${(value * 100).toFixed(1)}%`}
      onKeyDown={onKeyDown}
      onPointerDown={onPointer}
      onPointerMove={onPointer}
      className="absolute inset-y-0 -ml-5 flex w-10 cursor-ew-resize touch-none justify-center focus-visible:outline-2 focus-visible:outline-accent"
      style={{ left: `${value * 100}%` }}
    >
      <span aria-hidden="true" className="h-full w-0.5 bg-accent shadow" />
      <span
        aria-hidden="true"
        className="absolute top-2 size-7 rounded-pill border-2 border-white bg-accent"
      />
    </div>
  );
}

/**
 * The frozen camera image with two markers to drag onto the card's left
 * and right edges. Positions are fractions of the image width.
 */
export function CardEdges({
  draw,
  edges,
  onChange,
  labels,
}: {
  /** Paints the still into the canvas once it mounts. */
  draw: (canvas: HTMLCanvasElement) => void;
  edges: [number, number];
  onChange: (edges: [number, number]) => void;
  labels: { image: string; left: string; right: string };
}) {
  const painted = useRef(false);
  return (
    <div className="relative mx-auto w-full max-w-lg overflow-hidden rounded-media bg-ink">
      <div role="img" aria-label={labels.image}>
        <canvas
          ref={(canvas) => {
            if (canvas && !painted.current) {
              painted.current = true;
              draw(canvas);
            }
          }}
          aria-hidden="true"
          className="block h-auto w-full"
        />
      </div>
      <Edge
        value={edges[0]}
        label={labels.left}
        onChange={(value) => {
          onChange([value, edges[1]]);
        }}
      />
      <Edge
        value={edges[1]}
        label={labels.right}
        onChange={(value) => {
          onChange([edges[0], value]);
        }}
      />
    </div>
  );
}
