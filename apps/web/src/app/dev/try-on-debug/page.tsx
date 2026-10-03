import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { TryOnDebug } from '@/components/try-on/debug-loader';
import { getEnv } from '@/env';

export const metadata: Metadata = {
  title: 'Try-on debug',
  robots: { index: false, follow: false },
};

/** Developer page: face landmarks, tracker speed and measurements. Off in production. */
export default function TryOnDebugPage() {
  const env = getEnv();
  if (env.NODE_ENV === 'production' || !env.featureFlags.devTools) notFound();
  return (
    <main className="mx-auto max-w-content px-gutter py-10">
      <h1 className="text-display-md font-semibold">Try-on debug</h1>
      <p className="mt-2 max-w-prose text-ink-secondary">
        Landmarks, frames per second, detection time, face width, scale, face shape with its ratios,
        and the angle between the matrix and landmark head rotations. Camera frames stay in this
        tab.
      </p>
      <div className="mt-8">
        <TryOnDebug />
      </div>
    </main>
  );
}
