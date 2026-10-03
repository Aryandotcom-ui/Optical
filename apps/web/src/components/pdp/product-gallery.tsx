'use client';

import { Box } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ProductImage } from '@/components/product/product-image';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/cn';
import { useReducedMotion } from '@/lib/use-reduced-motion';
import { useProductView } from './product-view-context';

// three.js is about 600 kB; it loads only when someone opens the 3D view.
const FrameViewer = dynamic(() => import('./frame-viewer'), {
  ssr: false,
  loading: () => <Skeleton className="size-full rounded-media" />,
});

/**
 * Studio photos of the selected colour plus an interactive 3D view. The
 * first photo is the page's LCP image, so it is server-rendered with
 * preload; the viewer is fetched on demand.
 */
export function ProductGallery() {
  const t = useTranslations('pdp.gallery');
  const { product, variant } = useProductView();
  const reducedMotion = useReducedMotion() ?? false;
  const images = variant.images.filter((image) => image.kind !== 'detail');
  const [selected, setSelected] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);
  const current = images[Math.min(selected, images.length - 1)];
  const canView3d = product.frame !== null;

  return (
    <div className="flex flex-col gap-3 lg:flex-row-reverse">
      <div className="relative aspect-[4/3] flex-1 overflow-hidden rounded-media bg-surface-muted">
        {viewerOpen && product.frame ? (
          <FrameViewer
            frame={product.frame}
            variant={variant}
            name={product.name}
            reducedMotion={reducedMotion}
          />
        ) : current ? (
          <ProductImage
            key={current.url}
            src={current.url}
            alt={current.alt}
            fill
            preload={selected === 0}
            sizes="(min-width: 1024px) 55vw, 100vw"
            className="object-contain p-[5%]"
          />
        ) : null}
        {product.isNew && !viewerOpen ? (
          <span className="absolute top-4 left-4 rounded-pill bg-surface px-3 py-1 text-caption font-medium">
            {t('new')}
          </span>
        ) : null}
      </div>

      <ul
        className="no-scrollbar flex gap-2 overflow-x-auto lg:w-20 lg:flex-col"
        aria-label={t('views')}
      >
        {images.map((image, index) => (
          <li key={image.url} className="shrink-0">
            <button
              type="button"
              aria-pressed={!viewerOpen && index === selected}
              aria-label={t('showView', { view: t(`kind.${image.kind}`) })}
              onClick={() => {
                setSelected(index);
                setViewerOpen(false);
              }}
              className={cn(
                'duration-micro relative block aspect-[4/3] w-20 overflow-hidden rounded-control bg-surface-muted transition-shadow ease-standard ring-inset',
                !viewerOpen && index === selected
                  ? 'ring-2 ring-ink'
                  : 'ring-1 ring-hairline hover:ring-ink-secondary',
              )}
            >
              <ProductImage
                src={image.url}
                alt=""
                fill
                sizes="80px"
                className="object-contain p-1"
              />
            </button>
          </li>
        ))}
        {canView3d ? (
          <li className="shrink-0">
            <button
              type="button"
              aria-pressed={viewerOpen}
              onClick={() => {
                setViewerOpen(true);
              }}
              className={cn(
                'duration-micro flex aspect-[4/3] w-20 flex-col items-center justify-center gap-0.5 rounded-control bg-surface-muted text-caption font-medium transition-shadow ease-standard ring-inset',
                viewerOpen ? 'ring-2 ring-ink' : 'ring-1 ring-hairline hover:ring-ink-secondary',
              )}
            >
              <Box aria-hidden="true" className="size-5" strokeWidth={1.5} />
              {t('view3d')}
            </button>
          </li>
        ) : null}
      </ul>
    </div>
  );
}
