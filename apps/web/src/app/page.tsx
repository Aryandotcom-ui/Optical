import { brand } from '@optical/config/brand';
import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Wordmark } from '@/components/brand/wordmark';
import { Button } from '@/components/ui/button';
import { getEnv } from '@/env';

export default async function HomePage() {
  const t = await getTranslations('home');
  const tc = await getTranslations('common');
  const apiDocsUrl = `${getEnv().NEXT_PUBLIC_API_URL}/docs`;

  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-content flex-col px-gutter">
      <header className="py-6">
        <Wordmark className="text-headline" />
      </header>
      <section className="flex flex-1 flex-col justify-center py-section">
        <p className="text-caption font-medium tracking-wide text-ink-secondary uppercase">
          {t('eyebrow')}
        </p>
        <h1 className="mt-4 max-w-4xl text-display-xl font-semibold text-balance">
          {brand.tagline}
        </h1>
        <p className="mt-6 max-w-prose text-body-lg text-pretty text-ink-secondary">{t('lede')}</p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href="/status">{t('statusCta')}</Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <Link href="/dev/design-system">{t('designSystemCta')}</Link>
          </Button>
          <Button asChild size="lg" variant="ghost">
            <a href={apiDocsUrl} target="_blank" rel="noreferrer">
              {t('apiDocsCta')}
              <ArrowUpRight aria-hidden="true" className="size-4" strokeWidth={1.5} />
              <span className="sr-only">{tc('opensInNewTab')}</span>
            </a>
          </Button>
        </div>
      </section>
    </main>
  );
}
