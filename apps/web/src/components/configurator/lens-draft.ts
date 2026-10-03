import type {
  LensCatalog,
  LensConfig,
  LensFrameContext,
  LensPurpose,
  OptionRef,
} from '@optical/shared/lens';
import {
  hasBlockingIssues,
  lensAvailability,
  recommendIndex,
  quoteLens,
  strongestPower,
  strongestSignedPower,
  validatePrescription,
  type EyeRx,
  type LensAvailabilityMap,
  type LensQuote,
  type Prescription,
  type RxIssue,
} from '@optical/shared/lens/engine';

export type RxMode = 'manual' | 'upload' | 'later' | 'saved';

export interface RxDraft {
  right: EyeRx;
  left: EyeRx;
  pdKind: 'single' | 'dual';
  pd: number | null;
  pdRight: number | null;
  pdLeft: number | null;
}

/** Everything the customer has chosen so far, including half-finished prescription entry. */
export interface LensDraft {
  purpose: LensPurpose | null;
  rxMode: RxMode;
  rx: RxDraft;
  upload: { id: string; name: string } | null;
  /** A prescription saved to the account; its values (if typed) are copied into `rx`. */
  saved: { id: string; label: string; hasValues: boolean } | null;
  indexCode: string | null;
  packageCode: string | null;
  extraCoatingCodes: string[];
  tint: { code: string; colourCode: string | null; intensity: number | null } | null;
}

const plano = (): EyeRx => ({ sph: 0, cyl: null, axis: null, add: null });

export const emptyDraft: LensDraft = {
  purpose: null,
  rxMode: 'manual',
  rx: { right: plano(), left: plano(), pdKind: 'single', pd: null, pdRight: null, pdLeft: null },
  upload: null,
  saved: null,
  indexCode: null,
  packageCode: null,
  extraCoatingCodes: [],
  tint: null,
};

const DEFAULT_PURPOSE: Record<string, LensPurpose> = {
  'computer-glasses': 'computer',
  sunglasses: 'sun-rx',
};

/** The usual lens for this kind of frame, with that lens's default tint, as the starting point. */
export function defaultDraft(catalog: LensCatalog, category: string): LensDraft {
  const code = DEFAULT_PURPOSE[category] ?? 'single-vision';
  const purpose = catalog.purposes.find((option) => option.code === code) ?? catalog.purposes[0];
  const tint = catalog.tints.find((option) => option.code === purpose?.defaultTintCode);
  return {
    ...emptyDraft,
    purpose: purpose?.code ?? null,
    tint: tint
      ? { code: tint.code, colourCode: tint.colours[0]?.code ?? null, intensity: null }
      : null,
  };
}

/** The thinnest sensible material for the draft's prescription (or the base one when unknown). */
export function recommendedIndex(
  catalog: LensCatalog,
  draft: LensDraft,
  evaluation: DraftEvaluation,
  frame: LensFrameContext,
): string | null {
  if (!draft.purpose) return null;
  return (
    recommendIndex(
      catalog,
      {
        purpose: draft.purpose,
        frame,
        strongestPower: evaluation.signedPower === null ? null : Math.abs(evaluation.signedPower),
        selected: [],
      },
      frame.lensWidthMm,
    )?.indexCode ?? null
  );
}

/** A saved prescription's values in the entry form's shape. */
export function rxDraftFrom(rx: Prescription): RxDraft {
  return {
    right: rx.right,
    left: rx.left,
    pdKind: rx.pd.kind,
    pd: rx.pd.kind === 'single' ? rx.pd.value : null,
    pdRight: rx.pd.kind === 'dual' ? rx.pd.right : null,
    pdLeft: rx.pd.kind === 'dual' ? rx.pd.left : null,
  };
}

/** The prescription as typed, or null while the PD is still missing. */
export function draftPrescription(rx: RxDraft): Prescription | null {
  if (rx.pdKind === 'single')
    return rx.pd === null
      ? null
      : { right: rx.right, left: rx.left, pd: { kind: 'single', value: rx.pd } };
  if (rx.pdRight === null || rx.pdLeft === null) return null;
  return {
    right: rx.right,
    left: rx.left,
    pd: { kind: 'dual', right: rx.pdRight, left: rx.pdLeft },
  };
}

export function toLensConfig(draft: LensDraft, catalog: LensCatalog): LensConfig | null {
  const purpose = catalog.purposes.find((option) => option.code === draft.purpose);
  if (!purpose) return null;
  let prescription: LensConfig['prescription'] = null;
  if (purpose.requiresPrescription) {
    if (draft.rxMode === 'later') prescription = { mode: 'later' };
    else if (draft.rxMode === 'upload' && draft.upload)
      prescription = { mode: 'upload', uploadId: draft.upload.id };
    else if (draft.rxMode === 'saved' && draft.saved)
      prescription = { mode: 'saved', prescriptionId: draft.saved.id };
    else if (draft.rxMode === 'manual') {
      const rx = draftPrescription(draft.rx);
      prescription = rx ? { mode: 'manual', rx } : null;
    }
  }
  return {
    purpose: purpose.code,
    prescription,
    indexCode: purpose.requiresPrescription ? draft.indexCode : purpose.defaultIndexCode,
    packageCode: draft.packageCode,
    extraCoatingCodes: draft.extraCoatingCodes,
    tint: draft.tint,
  };
}

export interface DraftEvaluation {
  config: LensConfig | null;
  quote: LensQuote | null;
  availability: LensAvailabilityMap;
  rxIssues: RxIssue[];
  /** Strongest power in the typed prescription, signed, or null when unknown. */
  signedPower: number | null;
}

/**
 * Prices and checks the draft with the same engine the API runs. The
 * result is shown instantly; the API repeats it when the item is added.
 */
export function evaluateDraft(
  draft: LensDraft,
  catalog: LensCatalog,
  frame: LensFrameContext,
): DraftEvaluation {
  const purpose = catalog.purposes.find((option) => option.code === draft.purpose);
  const rx = draftPrescription(draft.rx);
  // Typed values: entered here, or copied from a saved prescription.
  const typed =
    draft.rxMode === 'manual' || (draft.rxMode === 'saved' && draft.saved?.hasValues === true);
  const rxIssues =
    purpose?.requiresPrescription && typed && rx
      ? validatePrescription(rx, { requiresAdd: purpose.requiresAdd })
      : [];
  const usable = purpose?.requiresPrescription && typed && rx && !hasBlockingIssues(rxIssues);
  const selected: OptionRef[] = [
    ...(draft.indexCode ? [{ type: 'index' as const, code: draft.indexCode }] : []),
    ...(draft.packageCode ? [{ type: 'package' as const, code: draft.packageCode }] : []),
    ...draft.extraCoatingCodes.map((code) => ({ type: 'coating' as const, code })),
    ...(draft.tint ? [{ type: 'tint' as const, code: draft.tint.code }] : []),
  ];
  const availability = lensAvailability(catalog, {
    purpose: purpose?.code ?? 'single-vision',
    frame,
    strongestPower: usable ? strongestPower(rx) : null,
    selected,
  });
  const config = toLensConfig(draft, catalog);
  return {
    config,
    quote: config ? quoteLens(catalog, config, frame) : null,
    availability,
    rxIssues,
    signedPower: usable ? strongestSignedPower(rx) : null,
  };
}

export type StepId = 'purpose' | 'prescription' | 'thickness' | 'coatings' | 'tint' | 'review';

export function stepsFor(draft: LensDraft, catalog: LensCatalog): StepId[] {
  const purpose = catalog.purposes.find((option) => option.code === draft.purpose);
  return purpose?.requiresPrescription === false
    ? ['purpose', 'coatings', 'tint', 'review']
    : ['purpose', 'prescription', 'thickness', 'coatings', 'tint', 'review'];
}

/** Whether a step's choices are complete enough to move on. */
export function stepComplete(step: StepId, draft: LensDraft, evaluation: DraftEvaluation): boolean {
  const errorsAt = (prefix: string) =>
    evaluation.quote && !evaluation.quote.ok
      ? evaluation.quote.errors.some((error) => error.path.startsWith(prefix))
      : false;
  switch (step) {
    case 'purpose':
      return (
        draft.purpose !== null &&
        evaluation.availability.purposes[draft.purpose]?.available !== false
      );
    case 'prescription':
      if (draft.rxMode === 'later') return true;
      if (draft.rxMode === 'upload') return draft.upload !== null;
      if (draft.rxMode === 'saved')
        return draft.saved !== null && !hasBlockingIssues(evaluation.rxIssues);
      return draftPrescription(draft.rx) !== null && !hasBlockingIssues(evaluation.rxIssues);
    case 'thickness':
      return draft.indexCode !== null && !errorsAt('indexCode');
    case 'coatings':
      return !errorsAt('packageCode') && !errorsAt('extraCoatingCodes');
    case 'tint':
      return !errorsAt('tint');
    case 'review':
      return evaluation.quote?.ok === true;
  }
}
