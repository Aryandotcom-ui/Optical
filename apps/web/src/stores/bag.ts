'use client';

import { createLocalValue } from '@/lib/local-value';

/**
 * Items in the bag, mirrored in this browser so the header can show the
 * count without asking the server on every page. Every bag response from
 * the API refreshes it (see lib/commerce-api.ts); other tabs follow via the
 * storage event.
 */
export const bagCount = createLocalValue<number>(
  'bag-count',
  (raw) => (typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 ? raw : null),
  0,
);
