import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ListingView } from '@/components/listing/listing-view';
import type { SearchParamsRecord } from '@/lib/listing-params';

interface Props {
  searchParams: Promise<SearchParamsRecord>;
}

function queryText(params: SearchParamsRecord): string {
  const value = params.q;
  return (Array.isArray(value) ? value[0] : value)?.trim().slice(0, 80) ?? '';
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const t = await getTranslations('pages.search');
  const q = queryText(await searchParams);
  return {
    title: q ? t('titleFor', { query: q }) : t('title'),
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage({ searchParams }: Props) {
  const t = await getTranslations('pages.search');
  const params = await searchParams;
  const q = queryText(params);
  // The query text stays in the URL like any filter, so refining keeps it.
  return (
    <ListingView
      searchParams={Promise.resolve(params)}
      eyebrow={t('eyebrow')}
      title={q ? t('titleFor', { query: q }) : t('title')}
      {...(q ? {} : { description: t('hint') })}
      basePath="/search"
      showCategory
      showCollection
    />
  );
}
