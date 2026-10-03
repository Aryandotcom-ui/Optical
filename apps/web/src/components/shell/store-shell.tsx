import { commerce } from '@optical/config/commerce';
import { cookies } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { formatPrice } from '@/lib/format';
import { getNavModel } from '@/lib/nav';
import { getStoreSettings } from '@/lib/store-settings';
import { ANNOUNCEMENT_COOKIE, ANNOUNCEMENT_VERSION, AnnouncementBar } from './announcement-bar';
import { MobileTabBar } from './mobile-tab-bar';
import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';

/** The storefront frame: announcement, header, main content, footer and mobile tabs. */
export async function StoreShell({ children }: { children: ReactNode }) {
  const [nav, t, cookieStore, settings] = await Promise.all([
    getNavModel(),
    getTranslations('shell'),
    cookies(),
    getStoreSettings(),
  ]);
  const dismissed = cookieStore.get(ANNOUNCEMENT_COOKIE)?.value === ANNOUNCEMENT_VERSION;
  return (
    <>
      {dismissed ? null : (
        <AnnouncementBar
          message={t('announcement', {
            amount: formatPrice(settings.market.freeShippingThresholdMinor),
            days: commerce.policies.returnWindowDays,
          })}
        />
      )}
      <SiteHeader nav={nav} />
      <main id="main" className="min-h-[60vh]">
        {children}
      </main>
      <SiteFooter nav={nav} />
      <MobileTabBar />
    </>
  );
}
