import { rxLimits } from '@optical/shared/rx';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { HelpShell } from '@/components/help/help-shell';
import { ScrollRegion } from '@/components/ui/scroll-region';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('help.prescription');
  return {
    title: t('title'),
    description: t('intro'),
    alternates: { canonical: '/help/prescription' },
  };
}

/** Signed dioptres the way prescriptions print them: +1.25, −0.50. */
const dioptre = (value: number) =>
  `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(2)}`;

const example = {
  od: { sph: -2.25, cyl: -0.5, axis: 180, add: 1.5 },
  os: { sph: -1.75, cyl: -0.75, axis: 175, add: 1.5 },
};

export default async function PrescriptionGuidePage() {
  const t = await getTranslations('help.prescription');
  const terms = [
    {
      key: 'sph',
      range: t('range', { min: dioptre(rxLimits.sph.min), max: dioptre(rxLimits.sph.max) }),
    },
    {
      key: 'cyl',
      range: t('range', { min: dioptre(rxLimits.cyl.min), max: dioptre(rxLimits.cyl.max) }),
    },
    { key: 'axis', range: t('rangeDegrees', { min: rxLimits.axis.min, max: rxLimits.axis.max }) },
    {
      key: 'add',
      range: t('range', { min: dioptre(rxLimits.add.min), max: dioptre(rxLimits.add.max) }),
    },
    { key: 'pd', range: t('rangeMm', { min: rxLimits.pd.min, max: rxLimits.pd.max }) },
  ] as const;

  return (
    <HelpShell current="/help/prescription" title={t('title')} intro={t('intro')}>
      <div className="space-y-14">
        <section aria-labelledby="example">
          <h2 id="example" className="text-headline font-semibold">
            {t('exampleTitle')}
          </h2>
          <ScrollRegion label={t('exampleCaption')} className="mt-6">
            <table className="tabular w-full max-w-xl min-w-[28rem] text-left">
              <caption className="sr-only">{t('exampleCaption')}</caption>
              <thead>
                <tr className="border-b border-hairline text-caption text-ink-secondary">
                  <td className="py-2" />
                  {(['sph', 'cyl', 'axis', 'add'] as const).map((column) => (
                    <th key={column} scope="col" className="py-2 font-medium">
                      {t(`terms.${column}.short`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(['od', 'os'] as const).map((eye) => (
                  <tr key={eye} className="border-b border-hairline">
                    <th scope="row" className="py-3 pr-4 text-left font-medium">
                      {t(`eyes.${eye}`)}
                    </th>
                    <td className="py-3">{dioptre(example[eye].sph)}</td>
                    <td className="py-3">{dioptre(example[eye].cyl)}</td>
                    <td className="py-3">{example[eye].axis}</td>
                    <td className="py-3">{dioptre(example[eye].add)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollRegion>
          <p className="mt-3 text-caption text-ink-secondary">{t('exampleNote')}</p>
        </section>

        <section aria-labelledby="terms">
          <h2 id="terms" className="text-headline font-semibold">
            {t('termsTitle')}
          </h2>
          <dl className="mt-6 max-w-prose divide-y divide-hairline">
            {terms.map((term) => (
              <div key={term.key} className="py-4">
                <dt className="font-medium">{t(`terms.${term.key}.name`)}</dt>
                <dd className="mt-1 text-ink-secondary">{t(`terms.${term.key}.body`)}</dd>
                <dd className="mt-1 text-caption text-ink-secondary">{term.range}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="validity">
          <h2 id="validity" className="text-headline font-semibold">
            {t('validityTitle')}
          </h2>
          <p className="mt-3 max-w-prose text-ink-secondary">{t('validityBody')}</p>
        </section>
      </div>
    </HelpShell>
  );
}
