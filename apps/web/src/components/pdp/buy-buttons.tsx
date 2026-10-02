'use client';

import type { LensFrameContext } from '@optical/shared/lens';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { notify } from '@/lib/notify';
import { useProductView } from './product-view-context';

const loadConfigurator = () => import('@/components/configurator/configurator');
const Configurator = dynamic(loadConfigurator, { ssr: false });

/**
 * "Choose lenses" (the configurator, downloaded on first use and prefetched
 * on hover or focus), "Frame only" and plain "Add to bag" for products sold
 * without lenses.
 */
export function BuyButtons() {
  const t = useTranslations('pdp.buy');
  const router = useRouter();
  const { product, variant } = useProductView();
  const [configuring, setConfiguring] = useState(false);
  const [opened, setOpened] = useState(false);
  const [adding, setAdding] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const soldOut = variant.stockState === 'out-of-stock';
  const frame: LensFrameContext | null = product.frame
    ? {
        rimType: product.frame.rimType,
        lensHeightMm: product.frame.lensHeightMm,
        lensWidthMm: product.frame.lensWidthMm,
      }
    : null;
  const withLenses = product.lensesAvailable && frame !== null;

  const addFrame = async () => {
    setAdding(true);
    // The request code is fetched on first use: product pages stay light.
    const { addToCart, CommerceError } = await import('@/lib/bag-api');
    try {
      await addToCart({ variantId: variant.id, expectedUnitPriceMinor: variant.priceMinor });
      void notify(t('added', { name: product.name }), {
        action: {
          label: t('viewBag'),
          onClick: () => {
            router.push('/cart');
          },
        },
      });
    } catch (error) {
      void notify(error instanceof CommerceError ? error.message : t('failed'));
    } finally {
      setAdding(false);
    }
  };

  if (soldOut)
    return (
      <Button size="lg" disabled className="w-full">
        {t('soldOut')}
      </Button>
    );

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      {withLenses ? (
        <>
          <Button
            ref={trigger}
            size="lg"
            className="flex-1"
            aria-haspopup="dialog"
            onPointerEnter={() => void loadConfigurator()}
            onFocus={() => void loadConfigurator()}
            onClick={() => {
              setOpened(true);
              setConfiguring(true);
            }}
          >
            {t('chooseLenses')}
          </Button>
          <Button size="lg" variant="secondary" disabled={adding} onClick={() => void addFrame()}>
            {adding ? t('adding') : t('frameOnly')}
          </Button>
        </>
      ) : (
        <Button size="lg" className="flex-1" disabled={adding} onClick={() => void addFrame()}>
          {adding ? t('adding') : t('addToBag')}
        </Button>
      )}
      {opened && frame ? (
        <Configurator
          open={configuring}
          onOpenChange={setConfiguring}
          returnFocusTo={trigger}
          product={product}
          variant={variant}
          frame={frame}
        />
      ) : null}
    </div>
  );
}
