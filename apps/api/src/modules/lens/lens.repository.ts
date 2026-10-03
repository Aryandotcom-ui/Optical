import { lensCatalogSchema, type LensCatalog } from '@optical/shared/lens';
import type { Db } from '../../infra/prisma';

export class LensRepository {
  constructor(private readonly db: Db) {}

  /** The active lens catalogue, validated against the shared schema. */
  async catalog(): Promise<LensCatalog> {
    const active = { where: { isActive: true }, orderBy: { sortOrder: 'asc' as const } };
    const [purposes, indexes, coatings, packages, tints, rules] = await Promise.all([
      this.db.lensPurpose.findMany(active),
      this.db.lensIndexOption.findMany(active),
      this.db.lensCoating.findMany(active),
      this.db.lensPackage.findMany(active),
      this.db.lensTint.findMany(active),
      this.db.lensRule.findMany({ where: { isActive: true }, orderBy: { id: 'asc' } }),
    ]);
    // Parsing strips database-only columns and fails loudly on bad admin data.
    return lensCatalogSchema.parse({ purposes, indexes, coatings, packages, tints, rules });
  }
}
