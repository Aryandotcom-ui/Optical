import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { WishlistView } from '@/components/saved/wishlist-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('wishlistPage');
  // A personal list: nothing for search engines to index.
  return { title: t('title'), robots: { index: false, follow: false } };
}

export default async function WishlistPage() {
  const t = await getTranslations('wishlistPage');
  return (
    <div className="mx-auto max-w-content px-gutter pt-10 pb-section">
      <h1 className="text-display-md font-semibold">{t('title')}</h1>
      <div className="mt-8">
        <WishlistView />
      </div>
    </div>
  );
}
