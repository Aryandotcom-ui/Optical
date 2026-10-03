import { brand } from '@optical/config/brand';
import { commerce } from '@optical/config/commerce';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { HelpShell } from '@/components/help/help-shell';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('help.returns');
  return {
    title: t('title'),
    description: t('intro', { days: commerce.policies.returnWindowDays }),
    alternates: { canonical: '/help/returns' },
  };
}

export default async function ReturnsGuidePage() {
  const t = await getTranslations('help.returns');
  const { returnWindowDays: days, frameWarrantyMonths: months } = commerce.policies;

  return (
    <HelpShell current="/help/returns" title={t('title')} intro={t('intro', { days })}>
      <div className="space-y-14">
        <section aria-labelledby="how">
          <h2 id="how" className="text-headline font-semibold">
            {t('howTitle')}
          </h2>
          <ol className="mt-6 max-w-prose space-y-4">
            {(['one', 'two', 'three', 'four'] as const).map((step, index) => (
              <li key={step} className="flex gap-4">
                <span
                  aria-hidden="true"
                  className="tabular flex size-8 shrink-0 items-center justify-center rounded-pill bg-surface-muted text-caption font-medium"
                >
                  {index + 1}
                </span>
                <span className="pt-1 text-ink-secondary">
                  {t(`steps.${step}`, { days, email: brand.supportEmail })}
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="refunds">
          <h2 id="refunds" className="text-headline font-semibold">
            {t('refundsTitle')}
          </h2>
          <p className="mt-3 max-w-prose text-ink-secondary">{t('refundsBody')}</p>
        </section>

        <section aria-labelledby="warranty">
          <h2 id="warranty" className="text-headline font-semibold">
            {t('warrantyTitle', { months })}
          </h2>
          <p className="mt-3 max-w-prose text-ink-secondary">{t('warrantyBody', { months })}</p>
          <ul className="mt-4 max-w-prose list-disc space-y-1 pl-5 text-ink-secondary">
            {(['covered', 'notCovered'] as const).map((key) => (
              <li key={key}>{t(`warrantyList.${key}`)}</li>
            ))}
          </ul>
        </section>

        <p className="text-caption text-ink-secondary">
          {t('policyLink')}{' '}
          <Link
            href={'/legal/returns' as Route}
            className="font-medium text-accent hover:underline"
          >
            {t('policyLinkText')}
          </Link>
        </p>
      </div>
    </HelpShell>
  );
}
