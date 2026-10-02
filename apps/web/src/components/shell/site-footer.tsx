import { brand } from '@optical/config/brand';
import { commerce } from '@optical/config/commerce';
import type { Route } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Wordmark } from '@/components/brand/wordmark';
import { formatPrice } from '@/lib/format';
import type { NavModel } from '@/lib/nav';

/** Calm footer: link groups, real policy facts from config, accepted payment methods. */
export async function SiteFooter({ nav }: { nav: NavModel }) {
  const t = await getTranslations('footer');
  const { policies, shipping } = commerce;
  const groups: { title: string; links: { href: string; label: string }[] }[] = [
    {
      title: t('shop'),
      links: nav.categories.map((category) => ({
        href: `/shop/${category.slug}`,
        label: category.name,
      })),
    },
    {
      title: t('help'),
      links: [
        { href: '/help', label: t('helpCentre') },
        { href: '/help/size-guide', label: t('sizeGuide') },
        { href: '/help/prescription', label: t('readPrescription') },
        { href: '/help/returns', label: t('returnsWarranty') },
      ],
    },
    {
      title: t('company'),
      links: [
        { href: '/legal/privacy', label: t('privacy') },
        { href: '/legal/terms', label: t('terms') },
        { href: '/legal/returns', label: t('returnsPolicy') },
        { href: '/legal/shipping', label: t('shippingPolicy') },
      ],
    },
  ];

  return (
    <footer className="border-t border-hairline bg-surface pb-24 md:pb-0">
      <div className="mx-auto grid max-w-content gap-12 px-gutter py-16 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="max-w-xs">
          <Wordmark className="text-headline" />
          <p className="mt-3 text-ink-secondary">{brand.tagline}</p>
          <ul className="mt-6 space-y-2 text-caption text-ink-secondary">
            <li>{t('facts.returns', { days: policies.returnWindowDays })}</li>
            <li>{t('facts.warranty', { months: policies.frameWarrantyMonths })}</li>
            <li>
              {t('facts.shipping', { amount: formatPrice(shipping.freeShippingThresholdMinor) })}
            </li>
          </ul>
        </div>
        {groups.map((group) => (
          <nav key={group.title} aria-label={group.title}>
            <h2 className="text-caption font-medium tracking-wide text-ink-secondary uppercase">
              {group.title}
            </h2>
            <ul className="mt-3 space-y-1">
              {group.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href as Route}
                    className="inline-flex min-h-11 items-center hover:text-accent md:min-h-9"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="mx-auto flex max-w-content flex-col gap-4 border-t border-hairline px-gutter py-6 text-caption text-ink-secondary md:flex-row md:items-center md:justify-between">
        <p>
          {t('copyright', { year: new Date().getFullYear(), name: brand.legalName })} ·{' '}
          {t('region', { country: t('countryName'), currency: commerce.currency })}
        </p>
        <ul className="flex flex-wrap gap-2" aria-label={t('payments')}>
          {(['upi', 'cards', 'netbanking', 'cod'] as const).map((method) => (
            <li key={method} className="rounded-control px-2 py-1 ring-1 ring-hairline">
              {t(`paymentMethods.${method}`)}
            </li>
          ))}
        </ul>
      </div>
    </footer>
  );
}
