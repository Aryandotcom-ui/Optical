import type { LensCatalog, LensFrameContext } from '@optical/shared/lens';
import type { DraftEvaluation, LensDraft } from './lens-draft';

export interface StepProps {
  catalog: LensCatalog;
  draft: LensDraft;
  evaluation: DraftEvaluation;
  frame: LensFrameContext;
  update: (patch: Partial<LensDraft>) => void;
}
