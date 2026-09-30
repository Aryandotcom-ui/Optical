import type {
  Category,
  Collection,
  CategorySlug,
  ListingQuery,
  ProductDetail,
  ProductListing,
  ProductSummary,
  SearchSuggestions,
} from '@optical/shared/catalog';
import { AppError } from '../../lib/app-error';
import type { Cache } from '../../lib/cache';
import type { CatalogRepository } from './catalog.repository';
import { toDetail, toIndexEntry, toSummary } from './catalog.mapper';
import { relatedEntries, runListing, type CatalogIndex } from './listing';

/** Cache namespace for catalogue reads; admin writes invalidate it (Phase 6). */
export const CATALOG_CACHE = 'catalog';
const INDEX_TTL_SECONDS = 60;
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
    return this.cache.getOrSet(CATALOG_CACHE, 'index', INDEX_TTL_SECONDS, async () => {
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
