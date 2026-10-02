import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ListingView } from '@/components/listing/listing-view';
import type { SearchParamsRecord } from '@/lib/listing-params';
import { listingRobots } from '@/lib/seo';

interface Props {
  searchParams: Promise<SearchParamsRecord>;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const t = await getTranslations('pages.shop');
  return {
    title: t('title'),
    description: t('description'),
    ...listingRobots('/shop', await searchParams),
  };
}

export default async function ShopPage({ searchParams }: Props) {
  const t = await getTranslations('pages.shop');
  return (
    <ListingView
      searchParams={searchParams}
      title={t('title')}
      description={t('description')}
      basePath="/shop"
      showCategory
      showCollection
    />
  );
}
