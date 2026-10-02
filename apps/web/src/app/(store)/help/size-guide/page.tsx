import { frameSizeBandsMm, frameSizes } from '@optical/shared/catalog';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { HelpShell } from '@/components/help/help-shell';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('help.sizeGuide');
  return {
    title: t('title'),
    description: t('intro'),
    alternates: { canonical: '/help/size-guide' },
  };
}

/** The inside of a temple arm, where the three size numbers are printed. */
function TempleArm({ label }: { label: string }) {
  return (
    <svg
      viewBox="0 0 360 56"
      role="img"
      aria-label={label}
      className="h-auto w-full max-w-lg text-ink"
    >
      <path
        d="M8 22 H300 C326 22 344 30 352 48 C346 46 338 44 330 44 H8 Z"
        fill="var(--color-surface-muted)"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <text x="40" y="38" fontSize="13" fill="currentColor" className="tabular" letterSpacing="1">
        52 □ 18 140
      </text>
    </svg>
  );
}

export default async function SizeGuidePage() {
  const t = await getTranslations('help.sizeGuide');
  const range = (size: (typeof frameSizes)[number]) => {
    const band = frameSizeBandsMm[size];
    if (!('min' in band)) return t('under', { max: band.max });
    if (!('max' in band)) return t('over', { min: band.min });
    return t('between', { min: band.min, max: band.max - 1 });
  };

  return (
    <HelpShell current="/help/size-guide" title={t('title')} intro={t('intro')}>
      <div className="space-y-14">
        <section aria-labelledby="numbers">
          <h2 id="numbers" className="text-headline font-semibold">
            {t('numbersTitle')}
          </h2>
          <p className="mt-3 max-w-prose text-ink-secondary">{t('numbersBody')}</p>
          <div className="mt-6">
            <TempleArm label={t('armLabel')} />
          </div>
          <dl className="mt-6 grid max-w-prose gap-4 sm:grid-cols-3">
            {(['lens', 'bridge', 'temple'] as const).map((key) => (
              <div key={key} className="rounded-card bg-surface-muted p-4">
                <dt className="font-medium">{t(`terms.${key}.name`)}</dt>
                <dd className="mt-1 text-caption text-ink-secondary">{t(`terms.${key}.body`)}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="our-sizes">
          <h2 id="our-sizes" className="text-headline font-semibold">
            {t('sizesTitle')}
          </h2>
          <p className="mt-3 max-w-prose text-ink-secondary">{t('sizesBody')}</p>
          <table className="mt-6 w-full max-w-prose text-left">
            <thead>
              <tr className="border-b border-hairline text-caption text-ink-secondary">
                <th scope="col" className="py-2 font-medium">
                  {t('sizeColumn')}
                </th>
                <th scope="col" className="py-2 font-medium">
                  {t('widthColumn')}
                </th>
                <th scope="col" className="py-2 font-medium">
                  <span className="sr-only">{t('shopColumn')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {frameSizes.map((size) => (
                <tr key={size} className="border-b border-hairline">
                  <th scope="row" className="py-3 font-medium">
                    {t(`sizeNames.${size}`)}
                  </th>
                  <td className="tabular py-3">{range(size)}</td>
                  <td className="py-3 text-right">
                    <Link
                      href={`/shop?size=${size}` as Route}
                      className="text-caption font-medium text-accent hover:underline"
                    >
                      {t(`shopSize.${size}`)}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section aria-labelledby="no-glasses">
          <h2 id="no-glasses" className="text-headline font-semibold">
            {t('noGlassesTitle')}
          </h2>
          <ol className="mt-4 max-w-prose list-decimal space-y-2 pl-5 text-ink-secondary">
            {(['one', 'two', 'three'] as const).map((step) => (
              <li key={step}>{t(`noGlassesSteps.${step}`)}</li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="comfort">
          <h2 id="comfort" className="text-headline font-semibold">
            {t('comfortTitle')}
          </h2>
          <ul className="mt-4 max-w-prose list-disc space-y-2 pl-5 text-ink-secondary">
            {(['bridge', 'temples', 'pads'] as const).map((tip) => (
              <li key={tip}>{t(`comfortTips.${tip}`)}</li>
            ))}
          </ul>
        </section>
      </div>
    </HelpShell>
  );
}
