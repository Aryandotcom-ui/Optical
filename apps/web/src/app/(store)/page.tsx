import { brand } from '@optical/config/brand';
import { faceShapes, type CategorySlug } from '@optical/shared/catalog';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { FaceShapes } from '@/components/home/face-shapes';
import { HeroFrame } from '@/components/home/hero-frame';
import { LensStory, type LensStoryStep } from '@/components/home/lens-story';
import { TrustStrip } from '@/components/home/trust-strip';
import { ProductImage } from '@/components/product/product-image';
import { ProductRail } from '@/components/product/product-rail';
import { Button } from '@/components/ui/button';
import {
  getCollection,
  getCollections,
  getLensOptions,
  getListing,
  getProduct,
} from '@/lib/catalog';
import { formatPrice } from '@/lib/format';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('home');
  return {
    title: { absolute: `${brand.name}: ${brand.tagline}` },
    description: t('metaDescription'),
    alternates: { canonical: '/' },
  };
}

/** The first collection's lead frame is also the hero. */
const RAIL_COLLECTIONS = ['everyday-classics', 'sun-season'] as const;
const TILE_CATEGORIES: CategorySlug[] = ['eyeglasses', 'sunglasses', 'computer-glasses', 'kids'];

export default async function HomePage() {
  const [t, tFace, tCategory, collections, lens, eyeglasses, ...tiles] = await Promise.all([
    getTranslations('home'),
    getTranslations('filters.faceShapeValues'),
    getTranslations('filters.categoryValues'),
    getCollections(),
    getLensOptions(),
    getListing({ category: 'eyeglasses', pageSize: 1 }),
    ...TILE_CATEGORIES.map((category) => getListing({ category, pageSize: 1, sort: 'rating' })),
  ]);
  const rails = await Promise.all(RAIL_COLLECTIONS.map((slug) => getCollection(slug)));
  const heroSlug = rails[0]?.products[0]?.slug;
  const hero = heroSlug ? await getProduct(heroSlug) : null;
  const heroVariant =
    hero?.variants.find((variant) => variant.id === hero.defaultVariantId) ??
    hero?.variants[0] ??
    null;
  const heroImage = heroVariant?.images.find((image) => image.kind === 'front');

  const price = (minor: number) => formatPrice(minor);
  const coating = (code: string) => lens.coatings.find((entry) => entry.code === code);
  const purpose = (code: string) => lens.purposes.find((entry) => entry.code === code);
  const standardIndex = lens.indexes[0];
  const thinnest = lens.indexes.at(-1);
  const polarised = lens.tints.find((tint) => tint.kind === 'polarised');
  const steps: LensStoryStep[] = [
    {
      id: 'thin',
      eyebrow: t('lens.thinEyebrow'),
      title: t('lens.thinTitle'),
      body: t('lens.thinBody', {
        standard: standardIndex?.name ?? '',
        thinnest: thinnest?.name ?? '',
      }),
      price: t('lens.thinPrice', { price: price(thinnest?.priceMinor ?? 0) }),
    },
    {
      id: 'clarity',
      eyebrow: t('lens.clarityEyebrow'),
      title: t('lens.clarityTitle'),
      body: coating('anti-reflective')?.benefit ?? '',
      price: t('lens.addOn', { price: price(coating('anti-reflective')?.priceMinor ?? 0) }),
    },
    {
      id: 'screens',
      eyebrow: t('lens.screensEyebrow'),
      title: t('lens.screensTitle'),
      body: coating('blue-light')?.benefit ?? '',
      price: t('lens.screensPrice', { price: price(purpose('computer')?.basePriceMinor ?? 0) }),
    },
    {
      id: 'sun',
      eyebrow: t('lens.sunEyebrow'),
      title: t('lens.sunTitle'),
      body: t('lens.sunBody'),
      price: t('lens.sunPrice', { price: price(polarised?.priceMinor ?? 0) }),
    },
  ];
  const visuals = {
    indexes: lens.indexes.map(({ code, refractiveIndex }) => ({ code, refractiveIndex })),
    tints: (lens.tints.find((tint) => tint.kind === 'solid')?.colours ?? []).map(
      ({ name, hex }) => ({ name, hex }),
    ),
    labels: { without: t('lens.without'), with: t('lens.with') },
  };
  const faceCounts = new Map(
    eyeglasses.facets.faceShape.map((option) => [option.value, option.count]),
  );
  const featured = collections.filter((collection) => collection.isFeatured);

  return (
    <>
      <section className="mx-auto grid max-w-content items-center gap-10 px-gutter pt-8 pb-section lg:grid-cols-2 lg:pt-16">
        <div>
          <h1 className="text-display-xl font-semibold text-balance">{brand.tagline}</h1>
          <p className="mt-6 max-w-prose text-body-lg text-pretty text-ink-secondary">
            {t('hero.lede')}
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href={'/shop/eyeglasses' as Route}>{t('hero.shopEyeglasses')}</Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link href={'/shop/sunglasses' as Route}>{t('hero.shopSunglasses')}</Link>
            </Button>
          </div>
        </div>
        {hero && heroImage ? (
          <figure>
            <HeroFrame image={heroImage} frame={hero.frame} variant={heroVariant} />
            <figcaption className="mt-2 text-center text-caption text-ink-secondary">
              <Link href={`/p/${hero.slug}` as Route} className="hover:text-ink hover:underline">
                {t('hero.shown', {
                  name: hero.name,
                  colour: heroVariant?.colourName ?? '',
                  price: price(heroVariant?.priceMinor ?? hero.priceMinor),
                })}
              </Link>
            </figcaption>
          </figure>
        ) : null}
      </section>

      <div className="mx-auto max-w-content space-y-section px-gutter pb-section">
        <section aria-labelledby="categories">
          <h2 id="categories" className="text-headline font-semibold">
            {t('categoriesTitle')}
          </h2>
          <ul className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {TILE_CATEGORIES.map((category, index) => {
              const listing = tiles[index];
              const image = listing?.items[0]?.variants[0]?.images.find(
                (entry) => entry.kind === 'angle',
              );
              return (
                <li key={category}>
                  <Link href={`/shop/${category}` as Route} className="group block">
                    <div className="relative aspect-[4/3] overflow-hidden rounded-media bg-surface-muted">
                      {image ? (
                        <ProductImage
                          src={image.url}
                          alt=""
                          fill
                          sizes="(min-width: 1024px) 25vw, 50vw"
                          className="duration-scene object-contain p-[8%] transition-transform ease-standard group-hover:scale-105 motion-reduce:transition-none"
                        />
                      ) : null}
                    </div>
                    <p className="mt-3 font-medium group-hover:text-accent">
                      {tCategory(category)}
                    </p>
                    <p className="text-caption text-ink-secondary">
                      {t('categoryCount', { count: listing?.total ?? 0 })}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby="lenses">
          <p className="text-caption font-medium tracking-wide text-ink-secondary uppercase">
            {t('lens.eyebrow')}
          </p>
          <h2 id="lenses" className="mt-3 max-w-3xl text-display-lg font-semibold text-balance">
            {t('lens.title')}
          </h2>
          <div className="mt-12">
            <LensStory steps={steps} visuals={visuals} />
          </div>
        </section>

        <section aria-labelledby="face-shapes">
          <h2 id="face-shapes" className="text-headline font-semibold">
            {t('faces.title')}
          </h2>
          <p className="mt-2 max-w-prose text-ink-secondary">{t('faces.body')}</p>
          <div className="mt-6">
            <FaceShapes
              items={faceShapes
                .filter((shape) => (faceCounts.get(shape) ?? 0) > 0)
                .map((shape) => ({
                  shape,
                  label: tFace(shape),
                  count: t('faces.count', { count: faceCounts.get(shape) ?? 0 }),
                }))}
            />
          </div>
        </section>

        {rails.map((collection) =>
          collection ? (
            <ProductRail
              key={collection.slug}
              id={`rail-${collection.slug}`}
              title={collection.name}
              products={collection.products}
              action={
                <Link
                  href={`/collections/${collection.slug}` as Route}
                  className="shrink-0 text-caption font-medium text-accent hover:underline"
                >
                  {t('seeAll')}
                </Link>
              }
            />
          ) : null,
        )}

        <section aria-labelledby="collections">
          <h2 id="collections" className="text-headline font-semibold">
            {t('collectionsTitle')}
          </h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {featured.map((collection) => (
              <li key={collection.slug}>
                <Link
                  href={`/collections/${collection.slug}` as Route}
                  className="duration-micro block h-full rounded-card bg-surface-muted p-6 transition-colors ease-standard hover:bg-hairline"
                >
                  <p className="text-headline font-semibold">{collection.name}</p>
                  <p className="mt-2 text-ink-secondary">{collection.tagline}</p>
                  <p className="mt-6 text-caption text-ink-secondary">
                    {t('collectionCount', { count: collection.productCount })}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="promises">
          <h2 id="promises" className="text-headline font-semibold">
            {t('trust.title')}
          </h2>
          <div className="mt-6">
            <TrustStrip />
          </div>
        </section>
      </div>
    </>
  );
}
