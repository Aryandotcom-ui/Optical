import { z } from 'zod';

/**
 * Prescription values and validation. Ranges follow what a typical
 * optical lab can surface; messages are written for customers, not
 * opticians, and each points at exactly one field.
 */
export const rxLimits = {
  sph: { min: -12, max: 12, step: 0.25 },
  cyl: { min: -6, max: 6, step: 0.25 },
  axis: { min: 1, max: 180, step: 1 },
  add: { min: 0.75, max: 3.5, step: 0.25 },
  pd: { min: 40, max: 80, step: 0.5 },
  monoPd: { min: 20, max: 40, step: 0.5 },
} as const;

/** Difference in power between eyes above which we suggest double-checking. */
export const ANISOMETROPIA_WARNING_DIOPTRES = 4;

const num = z.number();

export const eyeRxSchema = z.object({
  sph: num,
  cyl: num.nullable().default(null),
  axis: num.nullable().default(null),
  add: num.nullable().default(null),
});
export type EyeRx = z.infer<typeof eyeRxSchema>;

export const pdSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('single'), value: num }),
  z.object({ kind: z.literal('dual'), right: num, left: num }),
]);
export type PupillaryDistance = z.infer<typeof pdSchema>;

export const prescriptionSchema = z
  .object({
    /** OD, the right eye. */
    right: eyeRxSchema,
    /** OS, the left eye. */
    left: eyeRxSchema,
    pd: pdSchema,
  })
  .meta({ id: 'Prescription' });
export type Prescription = z.infer<typeof prescriptionSchema>;
export type PrescriptionInput = z.input<typeof prescriptionSchema>;

export interface RxIssue {
  /** e.g. "right.cyl", "pd.left" */
  path: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface RxValidationOptions {
  /** ADD is required for progressive lenses and not used otherwise. */
  requiresAdd: boolean;
}

const EYE_LABEL = { right: 'right eye', left: 'left eye' } as const;

function isOnStep(value: number, step: number): boolean {
  const scaled = value / step;
  return Math.abs(scaled - Math.round(scaled)) < 1e-9;
}

function formatDioptre(value: number): string {
  return `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(2)}`;
}

function checkRange(
  issues: RxIssue[],
  path: string,
  value: number,
  limits: { min: number; max: number; step: number },
  label: string,
  format: (value: number) => string,
) {
  if (value < limits.min || value > limits.max) {
    issues.push({
      path,
      severity: 'error',
      message: `${label} must be between ${format(limits.min)} and ${format(limits.max)}.`,
    });
  } else if (!isOnStep(value, limits.step)) {
    issues.push({
      path,
      severity: 'error',
      message: `${label} goes up in steps of ${String(limits.step)}. Check the value on your prescription.`,
    });
  }
}

function validateEye(
  eye: EyeRx,
  side: 'right' | 'left',
  options: RxValidationOptions,
  issues: RxIssue[],
) {
  const who = EYE_LABEL[side];
  checkRange(
    issues,
    `${side}.sph`,
    eye.sph,
    rxLimits.sph,
    `Sphere (SPH) for your ${who}`,
    formatDioptre,
  );

  const hasCyl = eye.cyl !== null && eye.cyl !== 0;
  if (eye.cyl !== null) {
    checkRange(
      issues,
      `${side}.cyl`,
      eye.cyl,
      rxLimits.cyl,
      `Cylinder (CYL) for your ${who}`,
      formatDioptre,
    );
  }
  if (hasCyl && eye.axis === null) {
    issues.push({
      path: `${side}.axis`,
      severity: 'error',
      message: `Your ${who} has a cylinder value, so it needs an axis too (a number from 1 to 180).`,
    });
  }
  if (eye.axis !== null) {
    if (!hasCyl) {
      issues.push({
        path: `${side}.axis`,
        severity: 'error',
        message: `An axis only applies when there is a cylinder value. Add the cylinder for your ${who}, or clear the axis.`,
      });
    } else {
      checkRange(issues, `${side}.axis`, eye.axis, rxLimits.axis, `Axis for your ${who}`, String);
    }
  }

  if (options.requiresAdd) {
    if (eye.add === null) {
      issues.push({
        path: `${side}.add`,
        severity: 'error',
        message: `Progressive lenses need the reading addition (ADD) for your ${who}. It is usually in its own column.`,
      });
    } else {
      checkRange(
        issues,
        `${side}.add`,
        eye.add,
        rxLimits.add,
        `Addition (ADD) for your ${who}`,
        formatDioptre,
      );
    }
  } else if (eye.add !== null && eye.add !== 0) {
    issues.push({
      path: `${side}.add`,
      severity: 'warning',
      message:
        'Your prescription has a reading addition. Single-vision lenses ignore it; choose progressive lenses to use it.',
    });
  }
}

function validatePd(pd: PupillaryDistance, issues: RxIssue[]) {
  const mm = (value: number) => `${String(value)} mm`;
  if (pd.kind === 'single') {
    checkRange(issues, 'pd.value', pd.value, rxLimits.pd, 'Pupillary distance (PD)', mm);
    return;
  }
  checkRange(issues, 'pd.right', pd.right, rxLimits.monoPd, 'Right PD', mm);
  checkRange(issues, 'pd.left', pd.left, rxLimits.monoPd, 'Left PD', mm);
}

/** Strongest power in any meridian of one eye: max(|SPH|, |SPH + CYL|). */
export function maxMeridianPower(eye: Pick<EyeRx, 'sph' | 'cyl'>): number {
  return Math.max(Math.abs(eye.sph), Math.abs(eye.sph + (eye.cyl ?? 0)));
}

/** Strongest power across both eyes, used to recommend a lens index. */
export function strongestPower(rx: Pick<Prescription, 'right' | 'left'>): number {
  return Math.max(maxMeridianPower(rx.right), maxMeridianPower(rx.left));
}

/**
 * The strongest meridian across both eyes, keeping its sign (−5.25 is a
 * minus lens, thickest at the edge; +3.00 is a plus lens, thickest at the
 * centre). Used for thickness estimates.
 */
export function strongestSignedPower(rx: Pick<Prescription, 'right' | 'left'>): number {
  const meridians = [rx.right, rx.left].flatMap((eye) => [eye.sph, eye.sph + (eye.cyl ?? 0)]);
  return meridians.reduce(
    (strongest, value) => (Math.abs(value) > Math.abs(strongest) ? value : strongest),
    0,
  );
}

/** Spherical equivalent: SPH + CYL / 2. */
export function sphericalEquivalent(eye: Pick<EyeRx, 'sph' | 'cyl'>): number {
  return eye.sph + (eye.cyl ?? 0) / 2;
}

/**
 * Validates a prescription. Errors block checkout; warnings are shown but
 * don't block (the prescription may be unusual but correct).
 */
export function validatePrescription(rx: Prescription, options: RxValidationOptions): RxIssue[] {
  const issues: RxIssue[] = [];
  validateEye(rx.right, 'right', options, issues);
  validateEye(rx.left, 'left', options, issues);
  validatePd(rx.pd, issues);

  const difference = Math.abs(sphericalEquivalent(rx.right) - sphericalEquivalent(rx.left));
  if (difference > ANISOMETROPIA_WARNING_DIOPTRES) {
    issues.push({
      path: 'left.sph',
      severity: 'warning',
      message:
        'The two eyes differ by more than 4 dioptres. That can be correct, but please double-check the values against your prescription.',
    });
  }

  if (
    options.requiresAdd &&
    rx.right.add !== null &&
    rx.left.add !== null &&
    rx.right.add !== rx.left.add
  ) {
    issues.push({
      path: 'left.add',
      severity: 'warning',
      message: 'The reading addition is usually the same for both eyes. Please double-check it.',
    });
  }
  return issues;
}

export function hasBlockingIssues(issues: readonly RxIssue[]): boolean {
  return issues.some((issue) => issue.severity === 'error');
}
