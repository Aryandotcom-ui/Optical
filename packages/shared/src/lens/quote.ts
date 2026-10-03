import {
  hasBlockingIssues,
  strongestPower,
  strongestSignedPower,
  validatePrescription,
  type RxIssue,
} from '../rx/validate';
import { availabilityOf, type LensSelectionContext } from './availability';
import type { LensCatalog, OptionRef } from './catalog';
import type { LensConfig, LensFrameContext } from './config';
import { TINT_INTENSITY } from './constants';
import { recommendIndex, type IndexRecommendation } from './recommend';
import { estimateLensThickness, type ThicknessEstimate } from './thickness';

export type LensLineKind = 'base' | 'index' | 'package' | 'coating' | 'tint';

export interface LensQuoteLine {
  kind: LensLineKind;
  code: string;
  label: string;
  priceMinor: number;
}

export type LensQuoteErrorCode =
  | 'unknown-option'
  | 'unavailable'
  | 'prescription-required'
  | 'prescription-invalid'
  | 'index-required'
  | 'invalid-tint-colour'
  | 'invalid-intensity';

export interface LensQuoteError {
  path: string;
  code: LensQuoteErrorCode;
  message: string;
}

export interface LensQuoteSuccess {
  ok: true;
  /** The configuration after defaults and de-duplication; store this as the snapshot. */
  config: LensConfig;
  lines: LensQuoteLine[];
  totalMinor: number;
  warnings: RxIssue[];
  recommendation: IndexRecommendation | null;
  /** Thickness per index for the visualiser, when the prescription is known. */
  thickness: { indexCode: string; estimate: ThicknessEstimate }[] | null;
}

export type LensQuote = LensQuoteSuccess | { ok: false; errors: LensQuoteError[] };

/**
 * Prices a lens configuration for one frame, enforcing the catalogue's
 * compatibility rules. Pure and deterministic: the web app runs it for
 * live prices and the API re-runs it on every cart write, rejecting any
 * client price that disagrees.
 */
export function quoteLens(
  catalog: LensCatalog,
  input: LensConfig,
  frame: LensFrameContext | null,
): LensQuote {
  const errors: LensQuoteError[] = [];
  const fail = (path: string, code: LensQuoteErrorCode, message: string) => {
    errors.push({ path, code, message });
  };

  const purpose = catalog.purposes.find((option) => option.code === input.purpose);
  if (!purpose)
    return {
      ok: false,
      errors: [
        { path: 'purpose', code: 'unknown-option', message: 'That lens type is not available.' },
      ],
    };

  // Normalise: lenses without power use the purpose's default index and no prescription.
  const prescription = purpose.requiresPrescription ? input.prescription : null;
  const indexCode = purpose.requiresPrescription ? input.indexCode : purpose.defaultIndexCode;
  const packageOption = input.packageCode
    ? catalog.packages.find((option) => option.code === input.packageCode)
    : undefined;
  if (input.packageCode && !packageOption)
    fail('packageCode', 'unknown-option', 'That coating package is not available.');

  const includedCoatings = new Set([
    ...purpose.includedCoatingCodes,
    ...(packageOption?.coatingCodes ?? []),
  ]);
  const extraCoatingCodes = [...new Set(input.extraCoatingCodes)]
    .filter((code) => !includedCoatings.has(code))
    .sort();
  const tintInput = input.tint ?? {
    code: purpose.defaultTintCode,
    colourCode: null,
    intensity: null,
  };
  const config: LensConfig = {
    purpose: purpose.code,
    prescription,
    indexCode,
    packageCode: packageOption?.code ?? null,
    extraCoatingCodes,
    tint: tintInput,
  };

  // Prescription.
  let warnings: RxIssue[] = [];
  let power: number | null = null;
  if (purpose.requiresPrescription) {
    if (!prescription) {
      fail(
        'prescription',
        'prescription-required',
        'These lenses are made to your prescription. Enter it, upload a photo, or choose to send it later.',
      );
    } else if (prescription.mode === 'manual') {
      const issues = validatePrescription(prescription.rx, { requiresAdd: purpose.requiresAdd });
      warnings = issues.filter((issue) => issue.severity === 'warning');
      for (const issue of issues.filter((entry) => entry.severity === 'error')) {
        fail(`prescription.rx.${issue.path}`, 'prescription-invalid', issue.message);
      }
      if (!hasBlockingIssues(issues)) power = strongestPower(prescription.rx);
    }
  }

  const selected: OptionRef[] = [
    ...(indexCode ? [{ type: 'index' as const, code: indexCode }] : []),
    ...(packageOption ? [{ type: 'package' as const, code: packageOption.code }] : []),
    ...extraCoatingCodes.map((code) => ({ type: 'coating' as const, code })),
    { type: 'tint', code: tintInput.code },
  ];
  const context: LensSelectionContext = {
    purpose: purpose.code,
    frame,
    strongestPower: power,
    selected,
  };
  const check = (ref: OptionRef, path: string) => {
    const availability = availabilityOf(ref, catalog, context);
    if (!availability.available)
      fail(path, 'unavailable', availability.reason ?? 'This option is not available here.');
  };

  check({ type: 'purpose', code: purpose.code }, 'purpose');
  const lines: LensQuoteLine[] = [
    { kind: 'base', code: purpose.code, label: purpose.name, priceMinor: purpose.basePriceMinor },
  ];

  // Index.
  const index = indexCode ? catalog.indexes.find((option) => option.code === indexCode) : undefined;
  if (!indexCode) {
    fail('indexCode', 'index-required', 'Choose a lens thickness.');
  } else if (!index) {
    fail('indexCode', 'unknown-option', 'That lens material is not available.');
  } else if (purpose.requiresPrescription) {
    check({ type: 'index', code: index.code }, 'indexCode');
    lines.push({
      kind: 'index',
      code: index.code,
      label: index.name,
      priceMinor: index.priceMinor,
    });
  }

  // Coatings.
  if (packageOption) {
    check({ type: 'package', code: packageOption.code }, 'packageCode');
    lines.push({
      kind: 'package',
      code: packageOption.code,
      label: packageOption.name,
      priceMinor: packageOption.priceMinor,
    });
  }
  extraCoatingCodes.forEach((code, position) => {
    const coating = catalog.coatings.find((option) => option.code === code);
    if (!coating) {
      fail(`extraCoatingCodes.${position}`, 'unknown-option', 'That coating is not available.');
      return;
    }
    check({ type: 'coating', code }, `extraCoatingCodes.${position}`);
    lines.push({ kind: 'coating', code, label: coating.name, priceMinor: coating.priceMinor });
  });

  // Tint.
  const tint = catalog.tints.find((option) => option.code === tintInput.code);
  if (!tint) {
    fail('tint.code', 'unknown-option', 'That tint is not available.');
  } else {
    check({ type: 'tint', code: tint.code }, 'tint.code');
    if (
      tint.colours.length > 0 &&
      !tint.colours.some((colour) => colour.code === tintInput.colourCode)
    ) {
      fail('tint.colourCode', 'invalid-tint-colour', `Choose a colour for ${tint.name}.`);
    }
    if (tint.colours.length === 0 && tintInput.colourCode !== null) {
      fail('tint.colourCode', 'invalid-tint-colour', `${tint.name} does not come in colours.`);
    }
    const intensity = tintInput.intensity;
    if (tint.supportsIntensity) {
      if (
        intensity !== null &&
        (intensity < TINT_INTENSITY.min || intensity > TINT_INTENSITY.max)
      ) {
        fail(
          'tint.intensity',
          'invalid-intensity',
          `Tint strength must be between ${TINT_INTENSITY.min}% and ${TINT_INTENSITY.max}%.`,
        );
      }
      config.tint = { ...tintInput, intensity: intensity ?? TINT_INTENSITY.default };
    } else if (intensity !== null) {
      fail('tint.intensity', 'invalid-intensity', `${tint.name} has a fixed strength.`);
    }
    if (tint.priceMinor > 0)
      lines.push({ kind: 'tint', code: tint.code, label: tint.name, priceMinor: tint.priceMinor });
  }

  if (errors.length > 0) return { ok: false, errors };

  const lensWidthMm = frame?.lensWidthMm ?? 52;
  const recommendation = purpose.requiresPrescription
    ? recommendIndex(catalog, context, lensWidthMm)
    : null;
  const signedPower =
    prescription?.mode === 'manual' && power !== null
      ? strongestSignedPower(prescription.rx)
      : null;
  const thickness =
    signedPower === null
      ? null
      : catalog.indexes.map((option) => ({
          indexCode: option.code,
          estimate: estimateLensThickness({
            power: signedPower,
            refractiveIndex: option.refractiveIndex,
            lensWidthMm,
          }),
        }));

  return {
    ok: true,
    config,
    lines,
    totalMinor: lines.reduce((sum, line) => sum + line.priceMinor, 0),
    warnings,
    recommendation,
    thickness,
  };
}
