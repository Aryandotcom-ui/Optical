'use client';

import { Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';

/** The "Not sure? Recommend for me" control every step has. */
export function RecommendButton({ onClick, label }: { onClick: () => void; label?: string }) {
  const t = useTranslations('configurator');
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-11 items-center gap-2 rounded-pill px-1 text-caption font-medium text-accent hover:underline"
    >
      <Sparkles aria-hidden="true" className="size-4" strokeWidth={1.5} />
      {label ?? t('recommend')}
    </button>
  );
}
