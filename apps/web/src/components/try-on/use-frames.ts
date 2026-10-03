'use client';

import type { ProductDetail } from '@optical/shared/catalog';
import { useEffect, useState } from 'react';
import { fetchListing, fetchProduct } from '@/lib/browser-api';

/** Product details fetched in this page view, shared by every try-on on the page. */
const details = new Map<string, Promise<ProductDetail | null>>();

export function loadFrame(slug: string): Promise<ProductDetail | null> {
  let pending = details.get(slug);
  if (!pending) {
    pending = fetchProduct(slug).catch(() => {
      details.delete(slug);
      return null;
    });
    details.set(slug, pending);
  }
  return pending;
}

/** Details for each slug as they arrive; frames without 3D data (accessories) are left out. */
export function useFrames(slugs: readonly string[]): Map<string, ProductDetail> {
  const [loaded, setLoaded] = useState(() => new Map<string, ProductDetail>());
  const key = slugs.join(',');
  useEffect(() => {
    let current = true;
    for (const slug of key ? key.split(',') : []) {
      void loadFrame(slug).then((product) => {
        if (!current || !product?.frame) return;
        setLoaded((previous) => {
          if (previous.get(slug) === product) return previous;
          const next = new Map(previous);
          next.set(slug, product);
          return next;
        });
      });
    }
    return () => {
      current = false;
    };
  }, [key]);
  return loaded;
}

/** A starting set when try-on is opened with no frames chosen: popular eyeglasses and sunglasses. */
export async function defaultFrames(): Promise<string[]> {
  const [eyeglasses, sunglasses] = await Promise.all([
    fetchListing('category=eyeglasses&sort=recommended&pageSize=6'),
    fetchListing('category=sunglasses&sort=recommended&pageSize=3'),
  ]);
  return [...eyeglasses, ...sunglasses].map((product) => product.slug);
}
