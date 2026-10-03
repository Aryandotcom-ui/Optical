import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { legalDocument, legalSlugs, type LegalSlug } from '@/content/legal';
import { cn } from '@/lib/cn';
import { formatLongDate } from '@/lib/format';

interface Props {
  params: Promise<{ doc: string }>;
}

const isLegalSlug = (value: string): value is LegalSlug =>
  (legalSlugs as readonly string[]).includes(value);

export function generateStaticParams() {
  return legalSlugs.map((doc) => ({ doc }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { doc } = await params;
  if (!isLegalSlug(doc)) return {};
  const document = legalDocument(doc);
  return {
    title: document.title,
    description: document.summary,
    alternates: { canonical: `/legal/${doc}` },
  };
}

export default async function LegalPage({ params }: Props) {
  const { doc } = await params;
  if (!isLegalSlug(doc)) notFound();
  const document = legalDocument(doc);
  const t = await getTranslations('legal');

  return (
    <div className="mx-auto grid max-w-content grid-cols-[minmax(0,1fr)] gap-10 px-gutter pt-10 pb-section lg:grid-cols-[14rem_minmax(0,1fr)]">
      <nav aria-label={t('nav')}>
        <ul className="no-scrollbar -mx-gutter flex gap-2 overflow-x-auto px-gutter lg:mx-0 lg:flex-col lg:gap-1 lg:px-0">
          {legalSlugs.map((slug) => (
            <li key={slug} className="shrink-0">
              <Link
                href={`/legal/${slug}` as Route}
                aria-current={slug === doc ? 'page' : undefined}
                className={cn(
                  'block rounded-pill px-4 py-2 text-caption font-medium lg:rounded-control lg:text-body',
                  slug === doc
                    ? 'bg-ink text-background'
                    : 'bg-surface-muted hover:bg-hairline lg:bg-transparent lg:hover:bg-surface-muted',
                )}
              >
                {legalDocument(slug).title}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <article className="max-w-prose min-w-0">
        <h1 className="text-display-md font-semibold">{document.title}</h1>
        <p className="mt-3 text-caption text-ink-secondary">
          {t('updated', { date: formatLongDate(`${document.updated}T12:00:00Z`) })}
        </p>
        <p className="mt-6 text-body-lg text-pretty text-ink-secondary">{document.summary}</p>
        <div className="mt-10 space-y-10">
          {document.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-headline font-semibold">{section.heading}</h2>
              <div className="mt-3 space-y-3 text-pretty text-ink-secondary">
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph.slice(0, 48)}>{paragraph}</p>
                ))}
                {section.list ? (
                  <ul className="list-disc space-y-1.5 pl-5">
                    {section.list.map((item) => (
                      <li key={item.slice(0, 48)}>{item}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </section>
          ))}
        </div>
      </article>
    </div>
  );
}
