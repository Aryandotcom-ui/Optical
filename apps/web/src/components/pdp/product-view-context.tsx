'use client';

import type { ProductDetail, VariantDetail } from '@optical/shared/catalog';
import { createContext, use, useCallback, useMemo, useState, type ReactNode } from 'react';

interface ProductView {
  product: ProductDetail;
  variant: VariantDetail;
  selectVariant: (id: string) => void;
}

const ProductViewContext = createContext<ProductView | null>(null);

/**
 * The selected colour, shared by the gallery, the purchase panel and the fit
 * guide. The choice is mirrored into `?colour=` with `history.replaceState`,
 * so a shared link opens on the same colour without a server round trip.
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
  const [variantId, setVariantId] = useState(initialVariantId);
  const variant = product.variants.find((entry) => entry.id === variantId) ?? product.variants[0];

  const selectVariant = useCallback(
    (id: string) => {
      setVariantId(id);
      const url = new URL(window.location.href);
      if (id === product.defaultVariantId) url.searchParams.delete('colour');
      else url.searchParams.set('colour', id);
      window.history.replaceState(
        window.history.state,
        '',
        `${url.pathname}${url.search}${url.hash}`,
      );
    },
    [product.defaultVariantId],
  );

  const value = useMemo(
    () => (variant ? { product, variant, selectVariant } : null),
    [product, variant, selectVariant],
  );
  if (!value) return null;
  return <ProductViewContext value={value}>{children}</ProductViewContext>;
}

export function useProductView(): ProductView {
  const context = use(ProductViewContext);
  if (!context) throw new Error('useProductView must be used inside ProductViewProvider');
  return context;
}
