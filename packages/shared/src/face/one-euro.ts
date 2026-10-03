/**
 * The One-Euro filter (Casiez, Roussel and Vogel, CHI 2012): a low-pass
 * filter whose cutoff rises with speed. Slow movements are smoothed hard
 * (no jitter when you hold still); fast ones pass through quickly (little
 * lag when you turn your head).
 */
export interface OneEuroOptions {
  /** Cutoff in Hz at rest. Lower is smoother and laggier. */
  minCutoff: number;
  /** How much the cutoff rises with speed. Higher reduces lag on fast moves. */
  beta: number;
  /** Cutoff in Hz for the speed estimate itself. */
  derivativeCutoff: number;
}

export const DEFAULT_ONE_EURO: OneEuroOptions = { minCutoff: 1.2, beta: 0.02, derivativeCutoff: 1 };

const alpha = (cutoffHz: number, dtSeconds: number) => {
  const tau = 1 / (2 * Math.PI * cutoffHz);
  return 1 / (1 + tau / dtSeconds);
};

export class OneEuroFilter {
  private previous: number | null = null;
  private previousDerivative = 0;
  private previousTime = 0;

  constructor(private readonly options: OneEuroOptions = DEFAULT_ONE_EURO) {}

  /** Filters one sample taken at `timeMs`. */
  filter(value: number, timeMs: number): number {
    if (this.previous === null) {
      this.previous = value;
      this.previousTime = timeMs;
      return value;
    }
    if (timeMs <= this.previousTime) return this.previous;
    const dt = (timeMs - this.previousTime) / 1000;
    const derivative = (value - this.previous) / dt;
    const smoothDerivative =
      this.previousDerivative +
      alpha(this.options.derivativeCutoff, dt) * (derivative - this.previousDerivative);
    const cutoff = this.options.minCutoff + this.options.beta * Math.abs(smoothDerivative);
    const result = this.previous + alpha(cutoff, dt) * (value - this.previous);
    this.previous = result;
    this.previousDerivative = smoothDerivative;
    this.previousTime = timeMs;
    return result;
  }

  reset(): void {
    this.previous = null;
    this.previousDerivative = 0;
  }
}

/** One filter per component, for positions and quaternions. */
export class OneEuroVector {
  private readonly filters: OneEuroFilter[];

  constructor(size: number, options: OneEuroOptions = DEFAULT_ONE_EURO) {
    this.filters = Array.from({ length: size }, () => new OneEuroFilter(options));
  }

  filter(values: readonly number[], timeMs: number): number[] {
    return values.map((value, index) => this.filters[index]?.filter(value, timeMs) ?? value);
  }

  reset(): void {
    for (const filter of this.filters) filter.reset();
  }
}
