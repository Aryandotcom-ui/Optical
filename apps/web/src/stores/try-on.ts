'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** Frames in the try-on carousel at once. */
export const TRY_ON_LIMIT = 12;

interface TryOnState {
  /** Product slugs in the carousel, in order. */
  frames: string[];
  active: string | null;
  /** The chosen colour (variant id) per product. */
  colours: Record<string, string>;
  /** Second frame for the split comparison, if any. */
  compare: string | null;
  mirror: boolean;
  watermark: boolean;
  /** Puts frames in the carousel (new ones first) and selects one. */
  open: (slugs: readonly string[], active?: string) => void;
  /** Adds frames to the end of the carousel, keeping the current choice. */
  suggest: (slugs: readonly string[]) => void;
  select: (slug: string) => void;
  setColour: (slug: string, variantId: string) => void;
  setCompare: (slug: string | null) => void;
  toggleMirror: () => void;
  toggleWatermark: () => void;
}

/**
 * The try-on session: which frames are being compared and how. Kept for
 * this tab (sessionStorage), so going to a product page or the bag and
 * back carries on where you left off. Nothing about your face is kept.
 */
export const useTryOn = create<TryOnState>()(
  persist(
    (set, get) => ({
      frames: [],
      active: null,
      colours: {},
      compare: null,
      mirror: true,
      watermark: true,
      open: (slugs, active) => {
        const fresh = slugs.filter((slug) => !get().frames.includes(slug));
        const frames = [...fresh, ...get().frames].slice(0, TRY_ON_LIMIT);
        set({ frames, active: active ?? slugs[0] ?? get().active ?? frames[0] ?? null });
      },
      suggest: (slugs) => {
        const { frames, active } = get();
        const added = slugs.filter((slug) => !frames.includes(slug));
        const next = [...frames, ...added].slice(0, TRY_ON_LIMIT);
        set({ frames: next, active: active ?? next[0] ?? null });
      },
      select: (slug) => {
        set({ active: slug, compare: get().compare === slug ? null : get().compare });
      },
      setColour: (slug, variantId) => {
        set({ colours: { ...get().colours, [slug]: variantId } });
      },
      setCompare: (slug) => {
        set({ compare: slug });
      },
      toggleMirror: () => {
        set({ mirror: !get().mirror });
      },
      toggleWatermark: () => {
        set({ watermark: !get().watermark });
      },
    }),
    {
      name: 'try-on-session',
      version: 1,
      storage: createJSONStorage(() => sessionStorage),
      partialize: ({ frames, active, colours, compare, mirror, watermark }) => ({
        frames,
        active,
        colours,
        compare,
        mirror,
        watermark,
      }),
    },
  ),
);
