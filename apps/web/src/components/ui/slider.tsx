'use client';

/**
 * Two-thumb range slider on native range inputs: arrow keys, Page Up/Down,
 * Home/End and screen-reader support come from the browser. The thumbs can
 * never cross; each needs its own accessible label.
 */
export function RangeSlider({
  min,
  max,
  step,
  value,
  onValueChange,
  onValueCommit,
  thumbLabels,
  formatValue,
}: {
  min: number;
  max: number;
  step: number;
  value: [number, number];
  onValueChange: (value: [number, number]) => void;
  onValueCommit: (value: [number, number]) => void;
  thumbLabels: [string, string];
  formatValue: (value: number) => string;
}) {
  const [low, high] = value;
  const span = max - min || 1;
  const set = (index: 0 | 1, raw: number): [number, number] =>
    index === 0 ? [Math.min(raw, high - step), high] : [low, Math.max(raw, low + step)];

  return (
    <div className="relative h-11 w-full">
      <div
        aria-hidden="true"
        className="absolute inset-x-3 top-1/2 h-1 -translate-y-1/2 rounded-pill bg-hairline"
      >
        <div
          className="absolute h-full rounded-pill bg-accent-strong"
          style={{
            left: `${((low - min) / span) * 100}%`,
            right: `${100 - ((high - min) / span) * 100}%`,
          }}
        />
      </div>
      {([0, 1] as const).map((index) => (
        <input
          key={index}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value[index]}
          aria-label={thumbLabels[index]}
          aria-valuetext={formatValue(value[index])}
          onChange={(event) => {
            onValueChange(set(index, Number(event.target.value)));
          }}
          onPointerUp={() => {
            onValueCommit(value);
          }}
          onKeyUp={() => {
            onValueCommit(value);
          }}
          className="dual-range"
        />
      ))}
    </div>
  );
}
