'use client';

import type { ProductDetail, VariantDetail } from '@optical/shared/catalog';
import {
  createContext,
  startTransition,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

interface ProductView {
  product: ProductDetail;
  /** The colour whose photos, price and stock are shown. */
  variant: VariantDetail;
}

interface ColourSelection {
  /** The colour just chosen; leads `variant` by a frame while the page catches up. */
  selectedId: string;
  selectVariant: (id: string) => void;
}

const ProductViewContext = createContext<ProductView | null>(null);
const ColourSelectionContext = createContext<ColourSelection | null>(null);

/**
 * The selected colour, shared by the gallery, the purchase panel and the fit
 * guide. Choosing a colour updates the swatches at once (their own small
 * context) and the photos, price and stock in a transition, so the click
 * paints immediately (INP). The choice is mirrored into `?colour=` with
 * `history.replaceState`, so a shared link opens on the same colour.
 */
export function ProductViewProvider({
  product,
  initialVariantId,
  children,
}: {
  product: ProductDetail;
  initialVariantId: string;
  children: ReactNode;
}) {
  const [selectedId, setSelectedId] = useState(initialVariantId);
  const [variantId, setVariantId] = useState(initialVariantId);
  const variant = product.variants.find((entry) => entry.id === variantId) ?? product.variants[0];

  // The URL follows after the paint: Next.js syncs history changes into its
  // router, and React runs a click's effects before painting, so the update
  // goes to a later task.
  useEffect(() => {
    const timer = setTimeout(() => {
      const url = new URL(window.location.href);
      const wanted = variantId === product.defaultVariantId ? null : variantId;
      if (url.searchParams.get('colour') === wanted) return;
      if (wanted) url.searchParams.set('colour', wanted);
      else url.searchParams.delete('colour');
      window.history.replaceState(
        window.history.state,
        '',
        `${url.pathname}${url.search}${url.hash}`,
      );
    }, 0);
    return () => {
      clearTimeout(timer);
    };
  }, [variantId, product.defaultVariantId]);

  const selectVariant = useCallback((id: string) => {
    setSelectedId(id);
    startTransition(() => {
      setVariantId(id);
    });
  }, []);

  const view = useMemo(() => (variant ? { product, variant } : null), [product, variant]);
  const selection = useMemo(() => ({ selectedId, selectVariant }), [selectedId, selectVariant]);
  if (!view) return null;
  return (
    <ProductViewContext value={view}>
      <ColourSelectionContext value={selection}>{children}</ColourSelectionContext>
    </ProductViewContext>
  );
}

export function useProductView(): ProductView {
  const context = use(ProductViewContext);
  if (!context) throw new Error('useProductView must be used inside ProductViewProvider');
  return context;
}

export function useColourSelection(): ColourSelection {
  const context = use(ColourSelectionContext);
  if (!context) throw new Error('useColourSelection must be used inside ProductViewProvider');
  return context;
}
