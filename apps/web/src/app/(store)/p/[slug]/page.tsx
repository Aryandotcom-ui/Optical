import { FACE_SHAPE_MATCH, reviewSortSchema } from '@optical/shared/catalog';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { unitLensOutline } from '@/components/pdp/fit-outline';
import { FitGuide } from '@/components/pdp/fit-guide';
import { ProductGallery } from '@/components/pdp/product-gallery';
import { ProductPurchase } from '@/components/pdp/product-purchase';
import { MAX_REVIEW_PAGES, ProductReviews } from '@/components/pdp/product-reviews';
import { ProductViewProvider } from '@/components/pdp/product-view-context';
import { ProductRail } from '@/components/product/product-rail';
import { WithMessages } from '@/components/providers/with-messages';
import { getEnv } from '@/env';
import { getCategories, getListing, getProduct, getRelated, getReviews } from '@/lib/catalog';
import { getStoreSettings } from '@/lib/store-settings';
import { jsonLdScript, productJsonLd } from '@/lib/structured-data';

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    colour?: string | string[];
    reviews?: string | string[];
    reviewPage?: string | string[];
  }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) return {};
  const variant =
    product.variants.find((entry) => entry.id === product.defaultVariantId) ?? product.variants[0];
  const image = variant?.images.find((entry) => entry.kind === 'front');
  return {
    title: product.seo.title,
    description: product.seo.description,
    // Every colour shares one canonical page.
    alternates: { canonical: `/p/${product.slug}` },
    openGraph: {
      type: 'website',
      title: product.seo.title,
      description: product.seo.description,
      url: `/p/${product.slug}`,
      ...(image
        ? { images: [{ url: image.url, width: image.width, height: image.height, alt: image.alt }] }
        : {}),
    },
  };
}

export default async function ProductPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) notFound();

  const { colour, reviews: reviewSortParam, reviewPage } = await searchParams;
  const requested = typeof colour === 'string' ? colour : undefined;
  const reviewSort = reviewSortSchema.catch('recent').parse(reviewSortParam);
  const reviewPages = Math.min(
    MAX_REVIEW_PAGES,
    Math.max(1, Number.parseInt(typeof reviewPage === 'string' ? reviewPage : '1', 10) || 1),
  );
  const initialVariantId = product.variants.some((variant) => variant.id === requested)
    ? (requested ?? product.defaultVariantId)
    : product.defaultVariantId;
  const isFrame = product.frame !== null;

  const [t, related, reviews, categories, accessories, settings] = await Promise.all([
    getTranslations('pdp'),
    getRelated(product.id),
    Promise.all(
      Array.from({ length: reviewPages }, (_, index) =>
        getReviews(product.id, reviewSort, index + 1),
      ),
    ),
    getCategories(),
    isFrame
      ? getListing({ category: 'accessories', pageSize: 4 }).then((listing) => listing.items)
      : Promise.resolve([]),
    getStoreSettings(),
  ]);
  const tFace = await getTranslations('filters.faceShapeValues');
  const categoryName =
    categories.find((category) => category.slug === product.category)?.name ?? product.category;
  const suits = product.faceShapes.filter((entry) => entry.score >= FACE_SHAPE_MATCH);

  return (
    <div className="mx-auto max-w-content px-gutter pt-6 pb-section">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(productJsonLd(product, getEnv().NEXT_PUBLIC_SITE_URL)),
        }}
      />
      <nav aria-label={t('breadcrumb')} className="text-caption text-ink-secondary">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link href="/shop" className="hover:text-ink">
              {t('shop')}
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link href={`/shop/${product.category}` as Route} className="hover:text-ink">
              {categoryName}
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="text-ink">
            {product.name}
          </li>
        </ol>
      </nav>

      <WithMessages namespaces={['configurator']}>
        <ProductViewProvider product={product} initialVariantId={initialVariantId}>
          <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-14">
            <div className="lg:sticky lg:top-24 lg:self-start">
              <ProductGallery />
            </div>
            <ProductPurchase
              categoryName={categoryName}
              freeShippingThresholdMinor={settings.market.freeShippingThresholdMinor}
              tryOn={settings.flags.virtualTryOn}
            />
          </div>

          <div className="mt-20 space-y-20">
            <section aria-labelledby="details" className="grid gap-10 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <h2 id="details" className="text-headline font-semibold">
                  {t('about')}
                </h2>
                <p className="mt-4 max-w-prose text-body-lg text-ink-secondary">
                  {product.description}
                </p>
                <h3 className="mt-8 font-medium">{t('care')}</h3>
                <p className="mt-2 max-w-prose text-ink-secondary">{product.materialsAndCare}</p>
              </div>
              {suits.length > 0 ? (
                <div>
                  <h3 className="font-medium">{t('suits')}</h3>
                  <p className="mt-2 text-caption text-ink-secondary">{t('suitsNote')}</p>
                  <ul className="mt-4 flex flex-wrap gap-2">
                    {suits.map((entry) => (
                      <li key={entry.faceShape}>
                        <Link
                          href={`/shop/${product.category}?faceShape=${entry.faceShape}` as Route}
                          className="inline-flex min-h-9 items-center rounded-pill bg-surface-muted px-4 text-caption font-medium hover:bg-hairline"
                        >
                          {tFace(entry.faceShape)}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>

            {product.frame ? (
              <section aria-labelledby="fit" className="scroll-mt-24">
                <h2 id="fit" className="text-headline font-semibold">
                  {t('fitTitle')}
                </h2>
                <p className="mt-2 max-w-prose text-ink-secondary">{t('fitIntro')}</p>
                <div className="mt-8">
                  <FitGuide frame={product.frame} outline={unitLensOutline(product.frame.shape)} />
                </div>
                <p className="mt-6 text-caption">
                  <Link
                    href={'/help/size-guide'}
                    className="font-medium text-accent hover:underline"
                  >
                    {t('sizeGuideLink')}
                  </Link>
                </p>
              </section>
            ) : null}
          </div>
        </ProductViewProvider>
      </WithMessages>

      <div className="mt-20 space-y-20">
        <section aria-labelledby="reviews" className="scroll-mt-24">
          <h2 id="reviews" className="text-headline font-semibold">
            {t('reviewsTitle')}
          </h2>
          <div className="mt-8">
            <ProductReviews
              productName={product.name}
              pages={reviews}
              sort={reviewSort}
              href={(sort, page) => {
                const params = new URLSearchParams();
                if (requested && requested !== product.defaultVariantId)
                  params.set('colour', requested);
                if (sort !== 'recent') params.set('reviews', sort);
                if (page > 1) params.set('reviewPage', String(page));
                const query = params.toString();
                return `/p/${product.slug}${query ? `?${query}` : ''}#reviews`;
              }}
            />
          </div>
        </section>
        <ProductRail id="complete-the-look" title={t('completeTheLook')} products={accessories} />
        <ProductRail id="related" title={t('related')} products={related} />
      </div>
    </div>
  );
}
