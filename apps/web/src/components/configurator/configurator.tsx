'use client';

import type { ProductDetail, VariantDetail } from '@optical/shared/catalog';
import type { LensCatalog, LensFrameContext } from '@optical/shared/lens';
import { ArrowLeft, Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Button } from '@/components/ui/button';
import SheetDialog from '@/components/ui/sheet-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { CommerceError, commerceApi } from '@/lib/commerce-api';
import { cn } from '@/lib/cn';
import { formatPrice } from '@/lib/format';
import { notify } from '@/lib/notify';
import { CoatingsStep } from './coatings-step';
import {
  defaultDraft,
  emptyDraft,
  evaluateDraft,
  recommendedIndex,
  stepComplete,
  stepsFor,
  type LensDraft,
  type StepId,
} from './lens-draft';
import { PrescriptionStep } from './prescription-step';
import { PurposeStep } from './purpose-step';
import { ReviewStep } from './review-step';
import { ThicknessStep } from './thickness-step';
import { TintStep } from './tint-step';

let catalogRequest: Promise<LensCatalog> | null = null;
/** The lens catalogue, fetched once per page view. */
function loadCatalog(): Promise<LensCatalog> {
  catalogRequest ??= commerceApi.lensOptions().catch((error: unknown) => {
    catalogRequest = null;
    throw error;
  });
  return catalogRequest;
}

/** Rough running price while choices are incomplete: what has been picked so far. */
function runningLensTotal(draft: LensDraft, catalog: LensCatalog): number {
  const purpose = catalog.purposes.find((option) => option.code === draft.purpose);
  const index = purpose?.requiresPrescription
    ? catalog.indexes.find((option) => option.code === draft.indexCode)
    : undefined;
  const pack = catalog.packages.find((option) => option.code === draft.packageCode);
  const extras = catalog.coatings.filter((coating) =>
    draft.extraCoatingCodes.includes(coating.code),
  );
  const tint = catalog.tints.find((option) => option.code === draft.tint?.code);
  return (
    (purpose?.basePriceMinor ?? 0) +
    (index?.priceMinor ?? 0) +
    (pack?.priceMinor ?? 0) +
    extras.reduce((sum, coating) => sum + coating.priceMinor, 0) +
    (tint?.priceMinor ?? 0)
  );
}

interface ConfiguratorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusTo: RefObject<HTMLElement | null>;
  product: ProductDetail;
  variant: VariantDetail;
  frame: LensFrameContext;
}

/**
 * The lens configurator: one step at a time, each with a sensible default
 * and a "recommend for me", a live price throughout, and a review before
 * adding to the bag. Prices come from the shared engine instantly; the API
 * re-prices when the item is added and refuses a mismatch.
 */
export default function Configurator({
  open,
  onOpenChange,
  returnFocusTo,
  product,
  variant,
  frame,
}: ConfiguratorProps) {
  const t = useTranslations('configurator');
  const router = useRouter();
  const [catalog, setCatalog] = useState<LensCatalog | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [draft, setDraft] = useState<LensDraft>(emptyDraft);
  const [defaulted, setDefaulted] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let cancelled = false;
    loadCatalog().then(
      (loaded) => {
        if (!cancelled) setCatalog(loaded);
      },
      () => {
        if (!cancelled) setLoadFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  // Sensible defaults once the catalogue is here: the usual lens type for this kind of frame.
  if (catalog && !defaulted) {
    setDefaulted(true);
    setDraft(defaultDraft(catalog, product.category));
  }

  const evaluation = useMemo(
    () => (catalog ? evaluateDraft(draft, catalog, frame) : null),
    [draft, catalog, frame],
  );
  const steps: StepId[] = catalog ? stepsFor(draft, catalog) : ['purpose'];
  const step = steps[Math.min(stepIndex, steps.length - 1)] ?? 'purpose';
  const isLast = step === 'review';

  const goTo = (index: number) => {
    setMessage(null);
    setStepIndex(index);
    // Arriving at thickness without a choice: start from the recommended material.
    if (steps[index] === 'thickness' && draft.indexCode === null && catalog && evaluation) {
      const recommended = recommendedIndex(catalog, draft, evaluation, frame);
      if (recommended) setDraft((current) => ({ ...current, indexCode: recommended }));
    }
    requestAnimationFrame(() => heading.current?.focus());
  };
  const update = (patch: Partial<LensDraft>) => {
    setMessage(null);
    setDraft((current) => ({ ...current, ...patch }));
  };

  const lensTotal =
    catalog && evaluation
      ? evaluation.quote?.ok
        ? evaluation.quote.totalMinor
        : runningLensTotal(draft, catalog)
      : 0;
  const total = variant.priceMinor + lensTotal;

  const next = () => {
    if (!evaluation || !stepComplete(step, draft, evaluation)) {
      setMessage(t(`incomplete.${step}`));
      return;
    }
    goTo(Math.min(stepIndex + 1, steps.length - 1));
  };

  const add = async () => {
    if (!evaluation?.quote?.ok) {
      setMessage(t('incomplete.review'));
      return;
    }
    setAdding(true);
    try {
      await commerceApi.addToCart({
        variantId: variant.id,
        lensConfig: evaluation.quote.config,
        expectedUnitPriceMinor: total,
      });
      onOpenChange(false);
      void notify(t('added', { name: product.name }), {
        action: {
          label: t('viewBag'),
          onClick: () => {
            router.push('/cart');
          },
        },
      });
    } catch (error) {
      if (error instanceof CommerceError && error.code === 'PRICE_CHANGED') {
        catalogRequest = null;
        void loadCatalog().then(setCatalog);
      }
      setMessage(error instanceof CommerceError ? error.message : t('addFailed'));
    } finally {
      setAdding(false);
    }
  };

  const stepProps = catalog && evaluation ? { catalog, draft, evaluation, frame, update } : null;
  const footer = (
    <div className="space-y-3">
      <p aria-live="polite" className="text-caption text-danger-ink empty:hidden">
        {message}
      </p>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-caption text-ink-secondary">
            {evaluation?.quote?.ok ? t('totalExact') : t('totalSoFar')}
          </p>
          <p className="tabular text-title font-semibold" aria-live="polite">
            {formatPrice(total)}
          </p>
        </div>
        <div className="flex gap-2">
          {stepIndex > 0 ? (
            <Button
              variant="secondary"
              aria-label={t('back')}
              onClick={() => {
                goTo(stepIndex - 1);
              }}
            >
              <ArrowLeft aria-hidden="true" className="size-4" strokeWidth={1.75} />
            </Button>
          ) : null}
          {isLast ? (
            <Button onClick={() => void add()} disabled={adding}>
              {adding ? t('adding') : t('addToBag')}
            </Button>
          ) : (
            <Button onClick={next} disabled={!catalog}>
              {t('next')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <SheetDialog
      open={open}
      onOpenChange={onOpenChange}
      returnFocusTo={returnFocusTo}
      side="panel"
      title={t('title', { name: product.name })}
      description={t('subtitle', { colour: variant.colourName })}
      closeLabel={t('close')}
      footer={footer}
    >
      <nav aria-label={t('stepsLabel')} className="mt-4">
        <ol className="flex flex-wrap gap-1.5">
          {steps.map((id, index) => {
            const done = evaluation
              ? stepComplete(id, draft, evaluation) && index < stepIndex
              : false;
            const reachable = index <= stepIndex;
            return (
              <li key={id}>
                <button
                  type="button"
                  disabled={!reachable}
                  aria-current={id === step ? 'step' : undefined}
                  onClick={() => {
                    goTo(index);
                  }}
                  className={cn(
                    'inline-flex min-h-9 items-center gap-1 rounded-pill px-3 text-caption font-medium ring-1 ring-hairline ring-inset',
                    id === step
                      ? 'bg-ink text-background ring-ink'
                      : 'text-ink-secondary hover:text-ink',
                    !reachable && 'opacity-50',
                  )}
                >
                  {done ? <Check aria-hidden="true" className="size-3.5" strokeWidth={2} /> : null}
                  {t(`steps.${id}`)}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
      <h3 ref={heading} tabIndex={-1} className="mt-6 text-title font-semibold outline-none">
        {t(`headings.${step}`)}
      </h3>
      <p className="mt-1 mb-5 text-caption text-ink-secondary">
        {t('progress', { current: steps.indexOf(step) + 1, total: steps.length })}
      </p>
      {loadFailed ? (
        <p className="text-danger-ink">{t('loadFailed')}</p>
      ) : !stepProps ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full rounded-card" />
          <Skeleton className="h-20 w-full rounded-card" />
          <Skeleton className="h-20 w-full rounded-card" />
        </div>
      ) : step === 'purpose' ? (
        <PurposeStep {...stepProps} sunglasses={product.category === 'sunglasses'} />
      ) : step === 'prescription' ? (
        <PrescriptionStep {...stepProps} />
      ) : step === 'thickness' ? (
        <ThicknessStep {...stepProps} />
      ) : step === 'coatings' ? (
        <CoatingsStep {...stepProps} />
      ) : step === 'tint' ? (
        <TintStep {...stepProps} />
      ) : (
        <ReviewStep
          {...stepProps}
          frameName={`${product.name}, ${variant.colourName}`}
          framePriceMinor={variant.priceMinor}
        />
      )}
    </SheetDialog>
  );
}
