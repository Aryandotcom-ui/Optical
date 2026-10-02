import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SharedWishlist } from '@/components/saved/shared-wishlist';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('wishlistPage');
  // Shared privately by link: never indexed, and the link never leaks in a Referer.
  return {
    title: t('sharedTitle'),
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
  };
}

export default async function SharedWishlistPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const [t, { token }] = await Promise.all([getTranslations('wishlistPage'), params]);
  return (
    <div className="mx-auto max-w-content px-gutter pt-10 pb-section">
      <h1 className="text-display-md font-semibold">{t('sharedTitle')}</h1>
      <p className="mt-2 max-w-prose text-ink-secondary">{t('sharedIntro')}</p>
      <div className="mt-8">
        <SharedWishlist token={token} />
      </div>
    </div>
  );
}
