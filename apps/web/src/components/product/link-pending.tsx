'use client';

import { useLinkStatus } from 'next/link';

/**
 * A soft shimmer over a product link while its page loads. Product pages
 * render with their data rather than a skeleton (so the photo can be
 * preloaded), so this is the feedback for that short wait.
 */
export function LinkPending() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden="true"
      className={`duration-ui pointer-events-none absolute inset-0 bg-background/40 transition-opacity delay-100 ${pending ? 'animate-shimmer opacity-100' : 'opacity-0'}`}
    />
  );
}
