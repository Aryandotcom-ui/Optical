import type { Route } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

const guides = [
  { href: '/help', key: 'centre' },
  { href: '/help/size-guide', key: 'sizeGuide' },
  { href: '/help/prescription', key: 'prescription' },
  { href: '/help/returns', key: 'returns' },
] as const;

/** Help pages share a side menu on wide screens and a link row on phones. */
export async function HelpShell({
  current,
  title,
  intro,
  children,
}: {
  current: (typeof guides)[number]['href'];
  title: string;
  intro: string;
  children: ReactNode;
}) {
  const t = await getTranslations('help.nav');
  return (
    <div className="mx-auto grid max-w-content grid-cols-[minmax(0,1fr)] gap-10 px-gutter pt-10 pb-section lg:grid-cols-[14rem_minmax(0,1fr)]">
      <nav aria-label={t('label')}>
        <ul className="no-scrollbar -mx-gutter flex gap-2 overflow-x-auto px-gutter lg:mx-0 lg:flex-col lg:gap-1 lg:px-0">
          {guides.map((guide) => (
            <li key={guide.href} className="shrink-0">
              <Link
                href={guide.href as Route}
                aria-current={guide.href === current ? 'page' : undefined}
                className={cn(
                  'duration-micro block rounded-pill px-4 py-2 text-caption font-medium transition-colors ease-standard lg:rounded-control lg:text-body',
                  guide.href === current
                    ? 'bg-ink text-background'
                    : 'bg-surface-muted hover:bg-hairline lg:bg-transparent lg:hover:bg-surface-muted',
                )}
              >
                {t(guide.key)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0">
        <h1 className="text-display-md font-semibold text-balance">{title}</h1>
        <p className="mt-4 max-w-prose text-body-lg text-pretty text-ink-secondary">{intro}</p>
        <div className="mt-10">{children}</div>
      </div>
    </div>
  );
}

/** Paragraph text from the API or config: blank lines separate paragraphs. */
export function Paragraphs({ text, className }: { text: string; className?: string }) {
  return (
    <>
      {text.split(/\n{2,}/).map((paragraph) => (
        <p
          key={paragraph.slice(0, 40)}
          className={cn('max-w-prose text-pretty text-ink-secondary', className)}
        >
          {paragraph}
        </p>
      ))}
    </>
  );
}
