import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ListingView } from '@/components/listing/listing-view';
import { getCollection } from '@/lib/catalog';
import type { SearchParamsRecord } from '@/lib/listing-params';
import { listingRobots } from '@/lib/seo';

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchParamsRecord>;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const collection = /^[a-z0-9-]{1,64}$/.test(slug) ? await getCollection(slug) : null;
  if (!collection) return {};
  return {
    title: collection.name,
    description: collection.description,
    ...listingRobots(`/collections/${slug}`, await searchParams),
  };
}

export default async function CollectionPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const collection = /^[a-z0-9-]{1,64}$/.test(slug) ? await getCollection(slug) : null;
  if (!collection) notFound();
  const t = await getTranslations('pages.collection');
  return (
    <ListingView
      searchParams={searchParams}
      fixed={{ collection: [collection.slug] }}
      eyebrow={t('eyebrow')}
      title={collection.name}
      description={`${collection.tagline} ${collection.description}`}
      basePath={`/collections/${collection.slug}`}
      showCategory
    />
  );
}
