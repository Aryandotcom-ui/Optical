import type { Prisma } from '../../generated/prisma/client';
import type { Db } from '../../infra/prisma';

const publishedProduct = { isPublished: true, deletedAt: null } satisfies Prisma.ProductWhereInput;

/** Everything needed to render product cards (list, search, collections, related). */
export const summaryInclude = {
  category: { select: { slug: true } },
  frame: true,
  variants: {
    where: { isActive: true },
    orderBy: { position: 'asc' },
    include: { images: { orderBy: { position: 'asc' } }, stock: true },
  },
} satisfies Prisma.ProductInclude;

export const detailInclude = {
  ...summaryInclude,
  faceShapes: { orderBy: { score: 'desc' } },
  collections: { include: { collection: { select: { slug: true, name: true } } } },
} satisfies Prisma.ProductInclude;

export type ProductSummaryRow = Prisma.ProductGetPayload<{ include: typeof summaryInclude }>;
export type ProductDetailRow = Prisma.ProductGetPayload<{ include: typeof detailInclude }>;

/** Lower-case word tokens, safe to splice into a tsquery (only [a-z0-9]). */
export function searchTokens(query: string): string[] {
  return (query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
    .filter((token) => /^[a-z0-9]+$/.test(token))
    .slice(0, 8);
}

export class CatalogRepository {
  constructor(private readonly db: Db) {}

  /** Rows for the in-memory catalogue index. */
  indexRows() {
    return this.db.product.findMany({
      where: publishedProduct,
      select: {
        id: true,
        slug: true,
        name: true,
        basePriceMinor: true,
        fit: true,
        styleTags: true,
        ratingAverage: true,
        ratingCount: true,
        popularity: true,
        launchedAt: true,
        category: { select: { slug: true } },
        frame: { select: { shape: true, material: true, totalWidthMm: true, features: true } },
        variants: {
          where: { isActive: true },
          select: {
            colourFamily: true,
            priceOverrideMinor: true,
            stock: { select: { onHand: true, reserved: true } },
          },
        },
        collections: { select: { collection: { select: { slug: true, name: true } } } },
        faceShapes: { select: { faceShape: true, score: true } },
      },
    });
  }

  /**
   * Full-text search with typo tolerance. Returns product ids with a
   * relevance score, best first. Combines:
   *  - English full-text (stemmed): "rounds" finds "round"
   *  - prefix matching for as-you-type: "avia" finds "aviator"
   *  - trigram similarity for typos: "harbor" finds "Harbour", "aviater" finds aviators
   */
  async search(query: string, limit = 200): Promise<Map<string, number>> {
    const tokens = searchTokens(query);
    if (tokens.length === 0) return new Map();
    const prefix = tokens.map((token) => `${token}:*`).join(' & ');
    const rows = await this.db.$queryRaw<{ id: string; rank: number }[]>`
      WITH q AS (
        SELECT websearch_to_tsquery('english', ${query}) AS en, to_tsquery('simple', ${prefix}) AS pre
      )
      SELECT p.id::text AS id,
             (ts_rank_cd(p."searchVector", q.en) * 2
               + ts_rank_cd(p."searchVector", q.pre)
               + similarity(p.name, ${query}) * 3
               + word_similarity(${query}, p."searchText"))::float AS rank
      FROM "Product" p, q
      WHERE p."isPublished" AND p."deletedAt" IS NULL
        AND (p."searchVector" @@ q.en
             OR p."searchVector" @@ q.pre
             OR p.name % ${query}
             OR word_similarity(${query}, p."searchText") > 0.45)
      -- Equal ranks are common (a typo matches a whole family of names), so
      -- ties fall back to popularity and then name: the same query always
      -- returns the same results, whatever the physical row order.
      ORDER BY rank DESC, p.popularity DESC, p.name ASC
      LIMIT ${limit}`;
    return new Map(rows.map((row) => [row.id, row.rank]));
  }

  /** Product cards for `ids`, returned in the same order. */
  async summaries(ids: readonly string[]): Promise<ProductSummaryRow[]> {
    if (ids.length === 0) return [];
    const rows = await this.db.product.findMany({
      where: { id: { in: [...ids] }, ...publishedProduct },
      include: summaryInclude,
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    return ids.map((id) => byId.get(id)).filter((row) => row !== undefined);
  }

  detailBySlug(slug: string): Promise<ProductDetailRow | null> {
    return this.db.product.findFirst({
      where: { slug, ...publishedProduct },
      include: detailInclude,
    });
  }

  frameContext(productId: string) {
    return this.db.product.findFirst({
      where: { id: productId, ...publishedProduct },
      select: {
        id: true,
        lensesAvailable: true,
        frame: { select: { rimType: true, lensHeightMm: true, lensWidthMm: true } },
      },
    });
  }

  /** Published reviews for a product, with sort and paging. */
  reviews(
    productId: string,
    options: { orderBy: Prisma.ReviewOrderByWithRelationInput[]; skip: number; take: number },
  ) {
    const where = { productId, status: 'PUBLISHED' as const };
    return Promise.all([
      this.db.review.findMany({
        where,
        orderBy: options.orderBy,
        skip: options.skip,
        take: options.take,
      }),
      this.db.review.groupBy({ by: ['rating'], where, _count: { _all: true } }),
    ]);
  }

  productExists(productId: string) {
    return this.db.product
      .count({ where: { id: productId, ...publishedProduct } })
      .then((count) => count > 0);
  }

  helpArticles() {
    return this.db.helpArticle.findMany({
      where: { isPublished: true },
      orderBy: [{ topic: 'asc' }, { sortOrder: 'asc' }],
    });
  }

  helpArticle(slug: string) {
    return this.db.helpArticle.findFirst({ where: { slug, isPublished: true } });
  }

  categoriesWithCounts() {
    return this.db.category.findMany({
      orderBy: { sortOrder: 'asc' },
      select: {
        slug: true,
        name: true,
        description: true,
        _count: { select: { products: { where: publishedProduct } } },
      },
    });
  }

  collections() {
    return this.db.collection.findMany({
      orderBy: { sortOrder: 'asc' },
      select: {
        slug: true,
        name: true,
        tagline: true,
        isFeatured: true,
        _count: { select: { products: { where: { product: publishedProduct } } } },
      },
    });
  }

  collectionBySlug(slug: string) {
    return this.db.collection.findUnique({
      where: { slug },
      include: { products: { orderBy: { position: 'asc' }, select: { productId: true } } },
    });
  }

  /** Categories, collections and help articles whose names resemble the query. */
  async suggestions(query: string) {
    const like = `%${query.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
    const [categories, collections, articles] = await Promise.all([
      this.db.$queryRaw<{ slug: string; name: string }[]>`
        SELECT slug, name FROM "Category"
        WHERE name ILIKE ${like} OR slug ILIKE ${like} OR similarity(name, ${query}) > 0.3
        ORDER BY similarity(name, ${query}) DESC LIMIT 3`,
      this.db.$queryRaw<{ slug: string; name: string }[]>`
        SELECT slug, name FROM "Collection"
        WHERE name ILIKE ${like} OR similarity(name, ${query}) > 0.3
        ORDER BY similarity(name, ${query}) DESC LIMIT 3`,
      this.db.$queryRaw<{ slug: string; title: string }[]>`
        SELECT slug, title FROM "HelpArticle"
        WHERE "isPublished" AND (title ILIKE ${like} OR word_similarity(${query}, title) > 0.5)
        ORDER BY word_similarity(${query}, title) DESC LIMIT 3`,
    ]);
    return { categories, collections, articles };
  }
}
