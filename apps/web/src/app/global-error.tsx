'use client';

import { brand } from '@optical/config/brand';
import './globals.css';

/**
 * Last-resort boundary for errors in the root layout itself. Translations
 * may be what failed, so this copy is inline and deliberately minimal.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en-IN">
      <body className="bg-background text-ink">
        <main className="mx-auto flex min-h-dvh max-w-prose flex-col justify-center px-6 py-24">
          <h1 className="text-display-md font-semibold">{brand.name} is having trouble loading</h1>
          <p className="mt-4 text-body-lg text-ink-secondary">
            Please try again in a moment. Nothing you entered has been lost.
          </p>
          {error.digest ? (
            <p className="mt-3 text-caption text-ink-secondary">Reference {error.digest}</p>
          ) : null}
          <button
            type="button"
            onClick={reset}
            className="mt-8 min-h-12 self-start rounded-pill bg-accent-strong px-7 text-on-accent"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
