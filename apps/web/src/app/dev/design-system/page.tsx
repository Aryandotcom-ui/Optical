import { commerce } from '@optical/config/commerce';
import { contrastRatio, motion, palette, radius, type ColorToken } from '@optical/config/tokens';
import { formatMoney } from '@optical/shared/money';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { Wordmark } from '@/components/brand/wordmark';
import { Button } from '@/components/ui/button';
import { getEnv } from '@/env';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('designSystem');
  return { title: t('title'), robots: { index: false, follow: false } };
}

const colorTokens = Object.keys(palette.light) as ColorToken[];

// Literal class names so Tailwind can see them at build time.
const typeScale = [
  ['display-xl', 'text-display-xl font-semibold'],
  ['display-lg', 'text-display-lg font-semibold'],
  ['display-md', 'text-display-md font-semibold'],
  ['title', 'text-title font-semibold'],
  ['headline', 'text-headline font-medium'],
  ['body-lg', 'text-body-lg'],
  ['body', 'text-body'],
  ['caption', 'text-caption'],
] as const;

const motionTiles = [
  ['micro', 'duration-micro'],
  ['ui', 'duration-ui'],
  ['scene', 'duration-scene'],
] as const;

const moneySamples = [249_900, 1_24_999_00, 99_50] as const;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-hairline py-12">
      <h2 className="text-title font-semibold">{title}</h2>
      <div className="mt-6">{children}</div>
    </section>
  );
}

export default async function DesignSystemPage() {
  const env = getEnv();
  if (env.NODE_ENV === 'production' || !env.featureFlags.devTools) notFound();
  const t = await getTranslations('designSystem');

  return (
    <main id="main" className="mx-auto max-w-content px-gutter pb-section">
      <header className="py-6">
        <Link href="/" className="inline-flex min-h-11 items-center">
          <Wordmark className="text-headline" />
        </Link>
      </header>
      <h1 className="mt-10 text-display-lg font-semibold">{t('title')}</h1>
      <p className="mt-4 max-w-prose text-body-lg text-ink-secondary">{t('lede')}</p>

      <Section title={t('colour')}>
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {colorTokens.map((token) => (
            <li
              key={token}
              className="overflow-hidden rounded-card bg-surface ring-1 ring-hairline"
            >
              <div className="h-16" style={{ backgroundColor: `var(--color-${token})` }} />
              <div className="tabular space-y-0.5 p-3 text-caption">
                <p className="font-medium text-ink">{token}</p>
                {(['light', 'dark'] as const).map((theme) => (
                  <p key={theme} className="text-ink-secondary">
                    {theme} {palette[theme][token]} ·{' '}
                    {t('contrastOnBackground', {
                      ratio: contrastRatio(
                        palette[theme][token],
                        palette[theme].background,
                      ).toFixed(1),
                    })}
                  </p>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={t('typography')}>
        <ul className="space-y-6">
          {typeScale.map(([name, className]) => (
            <li key={name} className="grid gap-2 md:grid-cols-[10rem_1fr] md:items-baseline">
              <span className="tabular text-caption text-ink-secondary">{name}</span>
              <span className={className}>{t('typeSample')}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={t('radius')}>
        <ul className="flex flex-wrap gap-6">
          {Object.entries(radius).map(([name, value]) => (
            <li key={name} className="text-center text-caption text-ink-secondary">
              <div
                className="size-24 bg-surface-muted ring-1 ring-hairline"
                style={{ borderRadius: value }}
              />
              <p className="mt-2">
                {name} · {value}
              </p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={t('motion')}>
        <p className="max-w-prose text-ink-secondary">{t('motionHint')}</p>
        <ul className="mt-6 grid gap-4 sm:grid-cols-3">
          {motionTiles.map(([name, durationClass]) => (
            <li key={name}>
              <button
                type="button"
                className="group @container relative h-24 w-full overflow-hidden rounded-card bg-surface text-left ring-1 ring-hairline"
              >
                <span
                  className={`absolute top-1/2 left-4 size-8 -translate-y-1/2 rounded-pill bg-accent transition-transform ease-standard group-hover:translate-x-[calc(100cqw-4rem)] group-focus-visible:translate-x-[calc(100cqw-4rem)] ${durationClass}`}
                />
                <span className="tabular absolute right-4 bottom-3 text-caption text-ink-secondary">
                  {name} · {motion.durationMs[name]} ms
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={t('buttons')}>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg">{t('primary')}</Button>
          <Button size="lg" variant="secondary">
            {t('secondary')}
          </Button>
          <Button size="lg" variant="ghost">
            {t('ghost')}
          </Button>
          <Button size="lg" disabled>
            {t('disabled')}
          </Button>
        </div>
      </Section>

      <Section title={t('money')}>
        <p className="text-ink-secondary">{t('moneyHint', { locale: commerce.locale })}</p>
        <ul className="tabular mt-4 space-y-1">
          {moneySamples.map((amount) => (
            <li key={amount}>
              <code className="text-caption text-ink-secondary">{amount}</code> →{' '}
              {formatMoney(amount)}
            </li>
          ))}
        </ul>
      </Section>
    </main>
  );
}
