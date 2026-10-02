import { categorySlugSchema } from '@optical/shared/catalog';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ListingView } from '@/components/listing/listing-view';
import { getCategories } from '@/lib/catalog';
import type { SearchParamsRecord } from '@/lib/listing-params';
import { listingRobots } from '@/lib/seo';

interface Props {
  params: Promise<{ category: string }>;
  searchParams: Promise<SearchParamsRecord>;
}

async function loadCategory(slug: string) {
  const parsed = categorySlugSchema.safeParse(slug);
  if (!parsed.success) return null;
  const categories = await getCategories();
  return categories.find((category) => category.slug === parsed.data) ?? null;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { category: slug } = await params;
  const category = await loadCategory(slug);
  if (!category) return {};
  return {
    title: category.name,
    description: category.description,
    ...listingRobots(`/shop/${category.slug}`, await searchParams),
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { category: slug } = await params;
  const category = await loadCategory(slug);
  if (!category) notFound();
  const t = await getTranslations('pages.shop');
  return (
    <ListingView
      searchParams={searchParams}
      fixed={{ category: category.slug }}
      eyebrow={t('eyebrow')}
      title={category.name}
      description={category.description}
      basePath={`/shop/${category.slug}`}
      showCollection
    />
  );
}
