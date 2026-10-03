import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  hasBlockingIssues,
  maxMeridianPower,
  prescriptionSchema,
  strongestPower,
  strongestSignedPower,
  validatePrescription,
  type Prescription,
  type PrescriptionInput,
} from './prescription';

const sv = { requiresAdd: false };
const prog = { requiresAdd: true };

function rx(input: Partial<PrescriptionInput> = {}): Prescription {
  return prescriptionSchema.parse({
    right: { sph: -2.25, cyl: -0.75, axis: 180 },
    left: { sph: -2, cyl: -0.5, axis: 175 },
    pd: { kind: 'single', value: 63 },
    ...input,
  });
}

const paths = (issues: ReturnType<typeof validatePrescription>) =>
  issues.map((issue) => issue.path);

describe('validatePrescription', () => {
  it('accepts a typical single-vision prescription', () => {
    expect(validatePrescription(rx(), sv)).toEqual([]);
  });

  it('accepts sphere-only eyes without cylinder or axis', () => {
    const issues = validatePrescription(
      rx({ right: { sph: 1.5 }, left: { sph: 1.25, cyl: 0 } }),
      sv,
    );
    expect(issues).toEqual([]);
  });

  it('asks for an axis when there is a cylinder', () => {
    const issues = validatePrescription(rx({ right: { sph: -1, cyl: -1 } }), sv);
    expect(issues).toEqual([
      expect.objectContaining({
        path: 'right.axis',
        severity: 'error',
        message: expect.stringContaining('needs an axis too') as string,
      }),
    ]);
  });

  it('rejects an axis without a cylinder', () => {
    const issues = validatePrescription(rx({ left: { sph: -1, axis: 90 } }), sv);
    expect(paths(issues)).toEqual(['left.axis']);
  });

  it('enforces ranges and quarter-dioptre steps', () => {
    const issues = validatePrescription(
      rx({ right: { sph: -12.5, cyl: -0.3, axis: 181 }, left: { sph: -12.1 } }),
      sv,
    );
    expect(paths(issues)).toEqual(['right.sph', 'right.cyl', 'right.axis', 'left.sph']);
    expect(issues[0]?.message).toContain('between −12.00 and +12.00');
    expect(issues[1]?.message).toContain('steps of 0.25');
  });

  it('requires ADD for progressive lenses and range-checks it', () => {
    const missing = validatePrescription(rx(), prog);
    expect(paths(missing)).toEqual(['right.add', 'left.add']);
    const bad = validatePrescription(
      rx({
        right: { sph: 1, add: 4 },
        left: { sph: 1, add: 2 },
      }),
      prog,
    );
    expect(paths(bad.filter((issue) => issue.severity === 'error'))).toEqual(['right.add']);
  });

  it('warns, without blocking, about ADD on single-vision lenses and mismatched ADDs', () => {
    const svIssues = validatePrescription(rx({ right: { sph: 1, add: 2 }, left: { sph: 1 } }), sv);
    expect(svIssues).toEqual([expect.objectContaining({ path: 'right.add', severity: 'warning' })]);
    expect(hasBlockingIssues(svIssues)).toBe(false);

    const progIssues = validatePrescription(
      rx({ right: { sph: 1, add: 2 }, left: { sph: 1, add: 2.25 } }),
      prog,
    );
    expect(progIssues).toEqual([
      expect.objectContaining({ path: 'left.add', severity: 'warning' }),
    ]);
  });

  it('warns when the eyes differ by more than 4 dioptres', () => {
    const issues = validatePrescription(rx({ right: { sph: -6 }, left: { sph: -1 } }), sv);
    expect(issues).toEqual([expect.objectContaining({ severity: 'warning', path: 'left.sph' })]);
  });

  it('validates single and dual PD', () => {
    expect(paths(validatePrescription(rx({ pd: { kind: 'single', value: 90 } }), sv))).toEqual([
      'pd.value',
    ]);
    expect(
      paths(validatePrescription(rx({ pd: { kind: 'dual', right: 31.5, left: 45 } }), sv)),
    ).toEqual(['pd.left']);
    expect(paths(validatePrescription(rx({ pd: { kind: 'single', value: 62.3 } }), sv))).toEqual([
      'pd.value',
    ]);
  });

  it('never reports a blocking issue for any in-range, on-step sphere-only prescription', () => {
    const quarter = fc.integer({ min: -48, max: 48 }).map((n) => n / 4);
    fc.assert(
      fc.property(quarter, quarter, fc.integer({ min: 80, max: 160 }), (right, left, pd) => {
        const issues = validatePrescription(
          rx({ right: { sph: right }, left: { sph: left }, pd: { kind: 'single', value: pd / 2 } }),
          sv,
        );
        expect(hasBlockingIssues(issues)).toBe(false);
      }),
    );
  });
});

describe('power helpers', () => {
  it('uses the strongest meridian, including minus cylinder', () => {
    expect(maxMeridianPower({ sph: -2, cyl: -1.5 })).toBe(3.5);
    expect(maxMeridianPower({ sph: 3, cyl: -1 })).toBe(3);
    expect(maxMeridianPower({ sph: 0.5, cyl: null })).toBe(0.5);
  });

  it('keeps the sign of the strongest meridian', () => {
    expect(strongestSignedPower(rx())).toBe(-3);
    expect(
      strongestSignedPower(rx({ right: { sph: 2.5, cyl: -0.5, axis: 90 }, left: { sph: 1 } })),
    ).toBe(2.5);
    expect(strongestSignedPower(rx({ right: { sph: 0 }, left: { sph: 0 } }))).toBe(0);
  });

  it('takes the stronger of the two eyes', () => {
    expect(strongestPower(rx())).toBe(3);
  });
});
