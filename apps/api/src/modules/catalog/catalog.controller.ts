import type { ListingQuery, ReviewSort } from '@optical/shared/catalog';
import type { FastifyReply } from 'fastify';
import type { CatalogService } from './catalog.service';

/** Shared caches and browsers may keep catalogue reads briefly. */
const PUBLIC_CACHE = 'public, max-age=30, stale-while-revalidate=120';
const NO_STORE = 'no-store';

export class CatalogController {
  constructor(private readonly service: CatalogService) {}

  list(query: ListingQuery, reply: FastifyReply) {
    // Search results depend on free text; keep them out of shared caches.
    void reply.header('cache-control', query.q ? NO_STORE : PUBLIC_CACHE);
    return this.service.list(query);
  }

  product(slug: string, reply: FastifyReply) {
    void reply.header('cache-control', PUBLIC_CACHE);
    return this.service.product(slug);
  }

  async related(productId: string, reply: FastifyReply) {
    void reply.header('cache-control', PUBLIC_CACHE);
    return { items: await this.service.related(productId) };
  }

  async byIds(ids: string[], reply: FastifyReply) {
    void reply.header('cache-control', PUBLIC_CACHE);
    return { items: await this.service.byIds(ids) };
  }

  reviews(productId: string, sort: ReviewSort, page: number, reply: FastifyReply) {
    void reply.header('cache-control', PUBLIC_CACHE);
    return this.service.reviews(productId, sort, page);
  }

  async categories(reply: FastifyReply) {
    void reply.header('cache-control', PUBLIC_CACHE);
    return { items: await this.service.categories() };
  }

  async collections(reply: FastifyReply) {
    void reply.header('cache-control', PUBLIC_CACHE);
    return { items: await this.service.collections() };
  }

  collection(slug: string, reply: FastifyReply) {
    void reply.header('cache-control', PUBLIC_CACHE);
    return this.service.collection(slug);
  }

  suggest(query: string, reply: FastifyReply) {
    void reply.header('cache-control', NO_STORE);
    return this.service.suggest(query);
  }
}
