import { rankFrames, type FinderAnswers, type FinderCandidate } from '@optical/shared/frame-finder';
import type { FinderResults } from '@optical/shared/frame-finder/schemas';
import type {
  Category,
  Collection,
  CategorySlug,
  CollectionSummary,
  ListingQuery,
  ProductDetail,
  ProductListing,
  ProductSummary,
  ReviewList,
  ReviewSort,
  SearchSuggestions,
} from '@optical/shared/catalog';
import type { Prisma } from '../../generated/prisma/client';
import { AppError } from '../../lib/app-error';
import type { Cache } from '../../lib/cache';
import type { CatalogRepository } from './catalog.repository';
import { toDetail, toIndexEntry, toSummary } from './catalog.mapper';
import { relatedEntries, runListing, type CatalogIndex } from './listing';

/** Cache namespace for catalogue reads; admin writes invalidate it (Phase 6). */
export const CATALOG_CACHE = 'catalog';
const INDEX_TTL_SECONDS = 60;
/** Bump when the index entry shape changes, so stale cached copies are never read. */
const INDEX_KEY = 'index:v3';
export const REVIEWS_PAGE_SIZE = 10;

const reviewOrder: Record<ReviewSort, Prisma.ReviewOrderByWithRelationInput[]> = {
  recent: [{ createdAt: 'desc' }],
  helpful: [{ helpfulCount: 'desc' }, { createdAt: 'desc' }],
  'rating-high': [{ rating: 'desc' }, { createdAt: 'desc' }],
  'rating-low': [{ rating: 'asc' }, { createdAt: 'desc' }],
};
/** Short, because product pages show live stock. */
const PRODUCT_TTL_SECONDS = 30;

export class CatalogService {
  constructor(
    private readonly repository: CatalogRepository,
    private readonly cache: Cache,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** The filterable index of every published product. */
  index(): Promise<CatalogIndex> {
    return this.cache.getOrSet(CATALOG_CACHE, INDEX_KEY, INDEX_TTL_SECONDS, async () => {
      const rows = await this.repository.indexRows();
      const collectionNames: Record<string, string> = {};
      for (const row of rows)
        for (const { collection } of row.collections)
          collectionNames[collection.slug] = collection.name;
      return { entries: rows.map(toIndexEntry), collectionNames };
    });
  }

  /** Product listing with filters, disjunctive facet counts, sorting and pagination. */
  async list(query: ListingQuery): Promise<ProductListing> {
    const [index, ranks] = await Promise.all([
      this.index(),
      query.q ? this.repository.search(query.q) : Promise.resolve(undefined),
    ]);
    const page = runListing(index, query, ranks);
    const rows = await this.repository.summaries(page.ids);
    const now = this.now();
    return {
      items: rows.map((row) => toSummary(row, now)),
      page: query.page,
      pageSize: query.pageSize,
      total: page.total,
      facets: page.facets,
    };
  }

  /** A published product by slug. Throws NOT_FOUND. */
  product(slug: string): Promise<ProductDetail> {
    return this.cache.getOrSet(CATALOG_CACHE, `product:${slug}`, PRODUCT_TTL_SECONDS, async () => {
      const row = await this.repository.detailBySlug(slug);
      if (!row)
        throw AppError.notFound(
          'We could not find that product. It may have been renamed or retired.',
        );
      return toDetail(row, this.now());
    });
  }

  /** "You may also like" for a product. Throws NOT_FOUND. */
  async related(productId: string): Promise<ProductSummary[]> {
    const index = await this.index();
    if (!index.entries.some((entry) => entry.id === productId))
      throw AppError.notFound('We could not find that product.');
    const rows = await this.repository.summaries(
      relatedEntries(index, productId).map((entry) => entry.id),
    );
    const now = this.now();
    return rows.map((row) => toSummary(row, now));
  }

  /**
   * Frame Finder results: every published frame scored against the answers
   * by the shared, documented scoring, best first, with the reasons.
   */
  async recommend(answers: FinderAnswers, limit = 24): Promise<FinderResults> {
    const index = await this.index();
    const candidates: FinderCandidate[] = index.entries
      .filter((entry) => entry.shape !== null && entry.category !== 'accessories')
      .map((entry) => ({
        id: entry.id,
        category: entry.category,
        material: entry.material as FinderCandidate['material'],
        priceMinor: entry.priceMinor,
        totalWidthMm: entry.totalWidthMm,
        styleTags: entry.styleTags,
        faceShapes: entry.faceShapeScores as FinderCandidate['faceShapes'],
        colourFamilies: entry.colourFamilies as FinderCandidate['colourFamilies'],
        rating: entry.ratingAverage ?? 0,
      }));
    const ranked = rankFrames(candidates, answers, limit);
    const products = new Map(
      (await this.byIds(ranked.map((entry) => entry.id))).map((p) => [p.id, p]),
    );
    return {
      items: ranked.flatMap((entry) => {
        const product = products.get(entry.id);
        return product ? [{ product, score: entry.score, reasons: entry.reasons }] : [];
      }),
    };
  }

  /** Product cards by id, in the order requested; unknown or unpublished ids are skipped. */
  async byIds(ids: readonly string[]): Promise<ProductSummary[]> {
    const rows = await this.repository.summaries([...new Set(ids)]);
    const now = this.now();
    return rows.map((row) => toSummary(row, now));
  }

  /** Published reviews with a rating histogram. Throws NOT_FOUND for unknown products. */
  async reviews(productId: string, sort: ReviewSort, page: number): Promise<ReviewList> {
    if (!(await this.repository.productExists(productId)))
      throw AppError.notFound('We could not find that product.');
    const [rows, groups] = await this.repository.reviews(productId, {
      orderBy: reviewOrder[sort],
      skip: (page - 1) * REVIEWS_PAGE_SIZE,
      take: REVIEWS_PAGE_SIZE,
    });
    const histogram = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
    let count = 0;
    let sum = 0;
    for (const group of groups) {
      const key = String(group.rating) as keyof typeof histogram;
      histogram[key] = group._count._all;
      count += group._count._all;
      sum += group.rating * group._count._all;
    }
    return {
      items: rows.map((row) => ({
        id: row.id,
        authorName: row.authorName,
        rating: row.rating,
        title: row.title,
        body: row.body,
        verifiedPurchase: row.orderItemId !== null,
        helpfulCount: row.helpfulCount,
        createdAt: row.createdAt.toISOString(),
      })),
      page,
      pageSize: REVIEWS_PAGE_SIZE,
      total: count,
      summary: { average: count ? Math.round((sum / count) * 10) / 10 : null, count, histogram },
    };
  }

  categories(): Promise<Category[]> {
    return this.cache.getOrSet(CATALOG_CACHE, 'categories', INDEX_TTL_SECONDS, async () => {
      const rows = await this.repository.categoriesWithCounts();
      return rows.map((row) => ({
        slug: row.slug as CategorySlug,
        name: row.name,
        description: row.description,
        productCount: row._count.products,
      }));
    });
  }

  collections(): Promise<CollectionSummary[]> {
    return this.cache.getOrSet(CATALOG_CACHE, 'collections', INDEX_TTL_SECONDS, async () => {
      const rows = await this.repository.collections();
      return rows.map((row) => ({
        slug: row.slug,
        name: row.name,
        tagline: row.tagline,
        isFeatured: row.isFeatured,
        productCount: row._count.products,
      }));
    });
  }

  /** A collection with its products in editorial order. Throws NOT_FOUND. */
  async collection(slug: string): Promise<Collection> {
    const collection = await this.repository.collectionBySlug(slug);
    if (!collection) throw AppError.notFound('We could not find that collection.');
    const rows = await this.repository.summaries(
      collection.products.map((entry) => entry.productId),
    );
    const now = this.now();
    return {
      slug: collection.slug,
      name: collection.name,
      tagline: collection.tagline,
      description: collection.description,
      products: rows.map((row) => toSummary(row, now)),
    };
  }

  /** Instant suggestions for the search palette. */
  async suggest(query: string): Promise<SearchSuggestions> {
    const trimmed = query.trim();
    if (!trimmed)
      return { query: trimmed, products: [], categories: [], collections: [], articles: [] };
    const [ranks, others] = await Promise.all([
      this.repository.search(trimmed, 6),
      this.repository.suggestions(trimmed),
    ]);
    const rows = await this.repository.summaries([...ranks.keys()]);
    return {
      query: trimmed,
      products: rows.map((row) => {
        const variant = row.variants.find((entry) => entry.isDefault) ?? row.variants[0];
        const image = variant?.images[0];
        return {
          slug: row.slug,
          name: row.name,
          category: row.category.slug as CategorySlug,
          priceMinor: row.basePriceMinor,
          image: image
            ? {
                url: image.url,
                alt: image.alt,
                width: image.width,
                height: image.height,
                kind: image.kind as 'front',
              }
            : null,
        };
      }),
      categories: others.categories.map((category) => ({
        slug: category.slug as CategorySlug,
        name: category.name,
      })),
      collections: others.collections,
      articles: others.articles,
    };
  }
}
