'use client';

import type {
  ProductImage as ProductImageData,
  FrameSpec,
  VariantDetail,
} from '@optical/shared/catalog';
import { Pause, Play } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { ProductImage } from '@/components/product/product-image';
import { cn } from '@/lib/cn';
import { useReducedMotion } from '@/lib/use-reduced-motion';

const HeroScene = dynamic(() => import('./hero-scene'), { ssr: false });

/** Whether this visit can afford the 3D upgrade: wide screen, no data saver. */
function canUpgrade(): boolean {
  if (!window.matchMedia('(min-width: 1024px)').matches) return false;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return connection?.saveData !== true;
}

/**
 * The hero frame. A studio photo renders first (it is the LCP image); once
 * the page is idle, wide screens without reduced motion or data saver swap
 * in a gently swaying 3D model, which can be paused.
 */
export function HeroFrame({
  image,
  frame,
  variant,
}: {
  image: ProductImageData;
  frame: FrameSpec | null;
  variant: VariantDetail | null;
}) {
  const t = useTranslations('home.hero');
  const reducedMotion = useReducedMotion();
  const [upgrade, setUpgrade] = useState(false);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (reducedMotion !== false || !frame || !variant || !canUpgrade()) return;
    if ('requestIdleCallback' in window) {
      const handle = window.requestIdleCallback(
        () => {
          setUpgrade(true);
        },
        { timeout: 4000 },
      );
      return () => {
        window.cancelIdleCallback(handle);
      };
    }
    const timer = setTimeout(() => {
      setUpgrade(true);
    }, 2500);
    return () => {
      clearTimeout(timer);
    };
  }, [reducedMotion, frame, variant]);

  const showScene = upgrade && frame && variant && reducedMotion === false;

  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-media bg-surface-muted">
      <ProductImage
        src={image.url}
        alt={image.alt}
        fill
        preload
        sizes="(min-width: 1024px) 50vw, 100vw"
        className={cn(
          'duration-scene object-contain p-[6%] transition-opacity ease-standard',
          showScene && ready && 'opacity-0',
        )}
      />
      {showScene ? (
        <div
          aria-hidden="true"
          className={cn(
            'duration-scene absolute inset-0 transition-opacity ease-standard',
            ready ? 'opacity-100' : 'opacity-0',
          )}
        >
          <HeroScene
            frame={frame}
            variant={variant}
            playing={playing}
            onReady={() => {
              setReady(true);
            }}
          />
        </div>
      ) : null}
      {showScene && ready ? (
        <button
          type="button"
          aria-pressed={!playing}
          aria-label={t('pause')}
          title={t('pause')}
          onClick={() => {
            setPlaying((value) => !value);
          }}
          className="absolute right-2 bottom-2 inline-flex size-11 items-center justify-center rounded-pill bg-surface/80 text-ink ring-1 ring-hairline backdrop-blur hover:bg-surface"
        >
          {playing ? (
            <Pause aria-hidden="true" className="size-4" strokeWidth={1.5} />
          ) : (
            <Play aria-hidden="true" className="size-4" strokeWidth={1.5} />
          )}
        </button>
      ) : null}
    </div>
  );
}
