import type { HelpArticle } from '@optical/shared/catalog';
import { AppError } from '../../lib/app-error';
import type { Cache } from '../../lib/cache';
import type { CatalogRepository } from '../catalog/catalog.repository';

const HELP_CACHE = 'help';
const HELP_TTL_SECONDS = 300;

const toArticle = (row: {
  slug: string;
  title: string;
  topic: string;
  body: string;
}): HelpArticle => ({
  slug: row.slug,
  title: row.title,
  topic: row.topic,
  body: row.body,
});

export class HelpService {
  constructor(
    private readonly repository: CatalogRepository,
    private readonly cache: Cache,
  ) {}

  articles(): Promise<HelpArticle[]> {
    return this.cache.getOrSet(HELP_CACHE, 'articles', HELP_TTL_SECONDS, async () =>
      (await this.repository.helpArticles()).map(toArticle),
    );
  }

  async article(slug: string): Promise<HelpArticle> {
    const row = await this.repository.helpArticle(slug);
    if (!row) throw AppError.notFound('We could not find that help article.');
    return toArticle(row);
  }
}
