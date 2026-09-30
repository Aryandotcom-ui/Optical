import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';

export default async function NotFound() {
  const t = await getTranslations('notFound');
  const tc = await getTranslations('common');
  return (
    <main
      id="main"
      className="mx-auto flex min-h-dvh max-w-prose flex-col justify-center px-gutter py-section"
    >
      <p className="text-caption font-medium text-ink-secondary">{t('code')}</p>
      <h1 className="mt-3 text-display-md font-semibold text-balance">{t('title')}</h1>
      <p className="mt-4 text-body-lg text-ink-secondary">{t('body')}</p>
      <div className="mt-8">
        <Button asChild size="lg">
          <Link href="/">{tc('goHome')}</Link>
        </Button>
      </div>
    </main>
  );
}
