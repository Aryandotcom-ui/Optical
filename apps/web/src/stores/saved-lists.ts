'use client';

import { useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** At most four frames can be compared side by side. */
export const COMPARE_LIMIT = 4;
const WISHLIST_LIMIT = 100;

export interface SavedProduct {
  id: string;
  slug: string;
}

interface SavedListsState {
  wishlist: SavedProduct[];
  compare: SavedProduct[];
  toggleWishlist: (product: SavedProduct) => boolean;
  /** Returns false when the compare list is already full. */
  toggleCompare: (product: SavedProduct) => 'added' | 'removed' | 'full';
  removeFromCompare: (id: string) => void;
  clearCompare: () => void;
}

/**
 * Guest wishlist and compare list, kept in this browser. Phase 4 syncs the
 * wishlist to the account on sign-in and merges the two.
 */
export const useSavedLists = create<SavedListsState>()(
  persist(
    (set, get) => ({
      wishlist: [],
      compare: [],
      toggleWishlist: (product) => {
        const exists = get().wishlist.some((item) => item.id === product.id);
        set({
          wishlist: exists
            ? get().wishlist.filter((item) => item.id !== product.id)
            : [product, ...get().wishlist].slice(0, WISHLIST_LIMIT),
        });
        return !exists;
      },
      toggleCompare: (product) => {
        const list = get().compare;
        if (list.some((item) => item.id === product.id)) {
          set({ compare: list.filter((item) => item.id !== product.id) });
          return 'removed';
        }
        if (list.length >= COMPARE_LIMIT) return 'full';
        set({ compare: [...list, product] });
        return 'added';
      },
      removeFromCompare: (id) => {
        set({ compare: get().compare.filter((item) => item.id !== id) });
      },
      clearCompare: () => {
        set({ compare: [] });
      },
    }),
    {
      name: 'saved-lists',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // Only persist the data, never the functions.
      partialize: ({ wishlist, compare }) => ({ wishlist, compare }),
    },
  ),
);

/**
 * True once the persisted lists have been read from storage. Starts false
 * on the server and the first client render, so markup always matches.
 */
export function useSavedListsHydrated(): boolean {
  return useSyncExternalStore(
    (listener) => useSavedLists.persist.onFinishHydration(listener),
    () => useSavedLists.persist.hasHydrated(),
    () => false,
  );
}
