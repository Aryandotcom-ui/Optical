import {
  type couponInputSchema,
  type couponUpdateSchema,
  type helpArticleInputSchema,
  type helpArticleUpdateSchema,
  type lensOptionUpdateSchema,
  type lensRuleUpdateSchema,
  type marketSettingsSchema,
  type roleUpdateSchema,
  type AdminListQuery,
  type LensKind,
} from '@optical/shared/admin';
import type { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client';
import type { Db } from '../../infra/prisma';
import { AppError } from '../../lib/app-error';
import type { Cache } from '../../lib/cache';
import { CATALOG_CACHE } from '../catalog/catalog.service';
import { LENS_CACHE } from '../lens/lens.service';
import {
  MARKET_KEY,
  RUNTIME_FLAGS,
  type RuntimeFlag,
  type SettingsService,
} from '../settings/settings.service';
import { audit, type Actor } from './access';
import { paging, sortBy } from './list';

const DAY_MS = 86_400_000;
const SOLD: Prisma.OrderWhereInput['status'] = {
  notIn: ['PENDING_PAYMENT', 'PAYMENT_FAILED', 'CANCELLED', 'REFUNDED'],
};

/** Everything else in the admin: dashboard, customers, coupons, reviews, help, lens, settings, audit. */
export class StoreAdmin {
  constructor(
    private readonly db: Db,
    private readonly cache: Cache,
    private readonly settings: SettingsService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async dashboard(days: number) {
    const since = new Date(this.now().getTime() - days * DAY_MS);
    const sold = { status: SOLD, placedAt: { gte: since } } satisfies Prisma.OrderWhereInput;
    const [revenue, placed, carts, topItems, statusCounts, awaiting, stock] = await Promise.all([
      this.db.order.aggregate({ where: sold, _sum: { totalMinor: true }, _count: true }),
      this.db.order.count({ where: { placedAt: { gte: since } } }),
      this.db.cart.count({ where: { createdAt: { gte: since } } }),
      this.db.orderItem.groupBy({
        by: ['productId', 'productName'],
        where: { order: sold },
        _sum: { quantity: true, totalMinor: true },
        orderBy: { _sum: { totalMinor: 'desc' } },
        take: 5,
      }),
      this.db.order.groupBy({ by: ['status'], _count: true }),
      this.db.order.count({
        where: { awaitingPrescription: true, status: { notIn: ['CANCELLED', 'REFUNDED'] } },
      }),
      this.db.stockItem.findMany({
        include: {
          variant: { select: { sku: true, colourName: true, product: { select: { name: true } } } },
        },
      }),
    ]);
    const orders = revenue._count;
    const revenueMinor = revenue._sum.totalMinor ?? 0;
    const lowStock = stock
      .map((item) => ({
        variantId: item.variantId,
        sku: item.variant.sku,
        product: item.variant.product.name,
        colour: item.variant.colourName,
        available: item.onHand - item.reserved,
        threshold: item.lowStockThreshold,
      }))
      .filter((item) => item.available <= item.threshold)
      .sort((a, b) => a.available - b.available)
      .slice(0, 8);
    return {
      days,
      revenueMinor,
      orders,
      averageOrderMinor: orders ? Math.round(revenueMinor / orders) : 0,
      // Orders placed per bag started: a proxy, since we don't track visits.
      conversion: { carts, placed, rate: carts ? placed / carts : 0 },
      topProducts: topItems.map((item) => ({
        productId: item.productId,
        name: item.productName,
        units: item._sum.quantity ?? 0,
        revenueMinor: item._sum.totalMinor ?? 0,
      })),
      statusCounts: Object.fromEntries(statusCounts.map((row) => [row.status, row._count])),
      awaitingPrescription: awaiting,
      lowStock,
    };
  }

  // ─── Customers ─────────────────────────────────────────────────────────

  async customers(query: AdminListQuery) {
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(query.q
        ? {
            OR: [
              { email: { contains: query.q.toLowerCase() } },
              { name: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const column = sortBy(query, ['createdAt', 'name', 'email'], 'createdAt');
    const [rows, total] = await Promise.all([
      this.db.user.findMany({
        where,
        orderBy: { [column]: query.dir },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
          orders: { where: { status: SOLD }, select: { totalMinor: true } },
        },
        ...paging(query),
      }),
      this.db.user.count({ where }),
    ]);
    const items = rows.map(({ orders, ...row }) => ({
      ...row,
      orders: orders.length,
      spentMinor: orders.reduce((sum, order) => sum + order.totalMinor, 0),
    }));
    return { items, total };
  }

  async customer(id: string) {
    const user = await this.db.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        marketingOptIn: true,
        createdAt: true,
        deletedAt: true,
        orders: {
          orderBy: { placedAt: 'desc' },
          take: 20,
          select: { id: true, number: true, status: true, totalMinor: true, placedAt: true },
        },
        _count: { select: { addresses: true } },
      },
    });
    if (!user) throw new AppError('NOT_FOUND', 'That customer does not exist.');
    return user;
  }

  async setRole(actor: Actor, id: string, input: z.infer<typeof roleUpdateSchema>) {
    if (id === actor.id) throw new AppError('CONFLICT', 'You cannot change your own role.');
    const before = await this.customer(id);
    await this.db.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { role: input.role } });
      // A changed role signs the person out everywhere, so it applies at once.
      await tx.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: this.now() },
      });
      await audit(tx, actor, {
        action: 'user.role',
        entityType: 'User',
        entityId: id,
        before: { role: before.role },
        after: input,
      });
    });
    return this.customer(id);
  }

  // ─── Coupons ───────────────────────────────────────────────────────────

  async coupons(query: AdminListQuery) {
    const where: Prisma.CouponWhereInput = query.q
      ? { code: { contains: query.q.toUpperCase() } }
      : {};
    const column = sortBy(query, ['createdAt', 'code', 'usageCount'], 'createdAt');
    const [items, total] = await Promise.all([
      this.db.coupon.findMany({ where, orderBy: { [column]: query.dir }, ...paging(query) }),
      this.db.coupon.count({ where }),
    ]);
    return { items, total };
  }

  async createCoupon(actor: Actor, input: z.infer<typeof couponInputSchema>) {
    if (await this.db.coupon.findUnique({ where: { code: input.code } }))
      throw new AppError('CONFLICT', 'A coupon with that code already exists.');
    return this.db.$transaction(async (tx) => {
      const coupon = await tx.coupon.create({ data: input });
      await audit(tx, actor, {
        action: 'coupon.create',
        entityType: 'Coupon',
        entityId: coupon.id,
        after: coupon,
      });
      return coupon;
    });
  }

  async updateCoupon(actor: Actor, id: string, input: z.infer<typeof couponUpdateSchema>) {
    const before = await this.db.coupon.findUnique({ where: { id } });
    if (!before) throw new AppError('NOT_FOUND', 'That coupon does not exist.');
    return this.db.$transaction(async (tx) => {
      const after = await tx.coupon.update({ where: { id }, data: input });
      await audit(tx, actor, {
        action: 'coupon.update',
        entityType: 'Coupon',
        entityId: id,
        before,
        after,
      });
      return after;
    });
  }

  // ─── Reviews ───────────────────────────────────────────────────────────

  async reviews(query: AdminListQuery, status: string | undefined) {
    const wanted =
      (['PENDING', 'PUBLISHED', 'REJECTED'] as const).find((value) => value === status) ??
      'PENDING';
    const where: Prisma.ReviewWhereInput = { status: wanted };
    const [rows, total] = await Promise.all([
      this.db.review.findMany({
        where,
        orderBy: { createdAt: query.dir },
        include: { product: { select: { name: true, slug: true } } },
        ...paging(query),
      }),
      this.db.review.count({ where }),
    ]);
    const items = rows.map(({ product, ...row }) => ({
      ...row,
      product: product.name,
      productSlug: product.slug,
    }));
    return { items, total };
  }

  async moderate(actor: Actor, id: string, status: 'PUBLISHED' | 'REJECTED') {
    const before = await this.db.review.findUnique({ where: { id } });
    if (!before) throw new AppError('NOT_FOUND', 'That review does not exist.');
    await this.db.$transaction(async (tx) => {
      await tx.review.update({ where: { id }, data: { status } });
      // Ratings shown on the storefront count published reviews only.
      const stats = await tx.review.aggregate({
        where: { productId: before.productId, status: 'PUBLISHED' },
        _avg: { rating: true },
        _count: true,
      });
      await tx.product.update({
        where: { id: before.productId },
        data: { ratingAverage: stats._avg.rating, ratingCount: stats._count },
      });
      await audit(tx, actor, {
        action: 'review.moderate',
        entityType: 'Review',
        entityId: id,
        before: { status: before.status },
        after: { status },
      });
    });
    await this.cache.invalidate(CATALOG_CACHE);
    return { id, status };
  }

  // ─── Help articles ─────────────────────────────────────────────────────

  async articles(query: AdminListQuery) {
    const where: Prisma.HelpArticleWhereInput = query.q
      ? { title: { contains: query.q, mode: 'insensitive' } }
      : {};
    const [items, total] = await Promise.all([
      this.db.helpArticle.findMany({
        where,
        orderBy: [{ topic: 'asc' }, { sortOrder: 'asc' }],
        ...paging(query),
      }),
      this.db.helpArticle.count({ where }),
    ]);
    return { items, total };
  }

  async saveArticle(
    actor: Actor,
    id: string | null,
    input: z.infer<typeof helpArticleInputSchema> | z.infer<typeof helpArticleUpdateSchema>,
  ) {
    const before = id ? await this.db.helpArticle.findUnique({ where: { id } }) : null;
    if (id && !before) throw new AppError('NOT_FOUND', 'That article does not exist.');
    if (input.slug) {
      const clash = await this.db.helpArticle.findUnique({ where: { slug: input.slug } });
      if (clash && clash.id !== id)
        throw new AppError('CONFLICT', 'Another article already uses that slug.');
    }
    const article = await this.db.$transaction(async (tx) => {
      const after = id
        ? await tx.helpArticle.update({ where: { id }, data: input })
        : await tx.helpArticle.create({ data: input as z.infer<typeof helpArticleInputSchema> });
      await audit(tx, actor, {
        action: id ? 'help.update' : 'help.create',
        entityType: 'HelpArticle',
        entityId: after.id,
        before,
        after,
      });
      return after;
    });
    await this.cache.invalidate('help');
    return article;
  }

  async deleteArticle(actor: Actor, id: string) {
    const before = await this.db.helpArticle.findUnique({ where: { id } });
    if (!before) throw new AppError('NOT_FOUND', 'That article does not exist.');
    await this.db.$transaction(async (tx) => {
      await tx.helpArticle.delete({ where: { id } });
      await audit(tx, actor, {
        action: 'help.delete',
        entityType: 'HelpArticle',
        entityId: id,
        before,
      });
    });
    await this.cache.invalidate('help');
    return { id };
  }

  // ─── Lens catalogue ────────────────────────────────────────────────────

  async lens() {
    const [purposes, indexes, coatings, packages, tints, rules] = await Promise.all([
      this.db.lensPurpose.findMany({ orderBy: { sortOrder: 'asc' } }),
      this.db.lensIndexOption.findMany({ orderBy: { sortOrder: 'asc' } }),
      this.db.lensCoating.findMany({ orderBy: { sortOrder: 'asc' } }),
      this.db.lensPackage.findMany({ orderBy: { sortOrder: 'asc' } }),
      this.db.lensTint.findMany({ orderBy: { sortOrder: 'asc' } }),
      this.db.lensRule.findMany({ orderBy: { id: 'asc' } }),
    ]);
    return { purposes, indexes, coatings, packages, tints, rules };
  }

  async updateLensOption(
    actor: Actor,
    kind: LensKind,
    code: string,
    input: z.infer<typeof lensOptionUpdateSchema>,
  ) {
    const { priceMinor, ...rest } = input;
    // Purposes are priced as a base; every other option has its own price.
    const data =
      kind === 'purposes'
        ? { ...rest, ...(priceMinor === undefined ? {} : { basePriceMinor: priceMinor }) }
        : input;
    const delegates = {
      purposes: this.db.lensPurpose,
      indexes: this.db.lensIndexOption,
      coatings: this.db.lensCoating,
      packages: this.db.lensPackage,
      tints: this.db.lensTint,
    } as const;
    const delegate = delegates[kind] as unknown as {
      findUnique: (args: { where: { code: string } }) => Promise<Record<string, unknown> | null>;
      update: (args: { where: { code: string }; data: object }) => Promise<Record<string, unknown>>;
    };
    const before = await delegate.findUnique({ where: { code } });
    if (!before) throw new AppError('NOT_FOUND', 'That lens option does not exist.');
    const after = await delegate.update({ where: { code }, data });
    await this.db.$transaction(async (tx) => {
      await audit(tx, actor, {
        action: `lens.${kind}.update`,
        entityType: `Lens:${kind}`,
        entityId: code,
        before,
        after,
      });
    });
    await Promise.all([this.cache.invalidate(LENS_CACHE), this.cache.invalidate(CATALOG_CACHE)]);
    return after;
  }

  async updateLensRule(actor: Actor, id: string, input: z.infer<typeof lensRuleUpdateSchema>) {
    const before = await this.db.lensRule.findUnique({ where: { id } });
    if (!before) throw new AppError('NOT_FOUND', 'That rule does not exist.');
    const after = await this.db.$transaction(async (tx) => {
      const updated = await tx.lensRule.update({ where: { id }, data: input });
      await audit(tx, actor, {
        action: 'lens.rule.update',
        entityType: 'LensRule',
        entityId: id,
        before,
        after: updated,
      });
      return updated;
    });
    await this.cache.invalidate(LENS_CACHE);
    return after;
  }

  // ─── Settings ──────────────────────────────────────────────────────────

  async readSettings() {
    const flags = await this.settings.flags();
    return {
      market: await this.settings.marketSettings(),
      flags: RUNTIME_FLAGS.map((key) => ({ key, enabled: flags[key] })),
    };
  }

  async saveMarket(actor: Actor, input: z.infer<typeof marketSettingsSchema>) {
    const before = await this.settings.marketSettings();
    await this.db.$transaction(async (tx) => {
      await tx.setting.upsert({
        where: { key: MARKET_KEY },
        create: { key: MARKET_KEY, value: input },
        update: { value: input },
      });
      await audit(tx, actor, {
        action: 'settings.market',
        entityType: 'Setting',
        entityId: MARKET_KEY,
        before,
        after: input,
      });
    });
    this.settings.invalidate();
    return this.readSettings();
  }

  async setFlag(actor: Actor, key: string, enabled: boolean) {
    const flag = RUNTIME_FLAGS.find((name): name is RuntimeFlag => name === key);
    if (!flag) throw new AppError('NOT_FOUND', 'That feature cannot be switched here.');
    const before = (await this.settings.flags())[flag];
    await this.db.$transaction(async (tx) => {
      await tx.featureFlag.upsert({
        where: { key: flag },
        create: { key: flag, enabled, description: `Admin override for ${flag}` },
        update: { enabled },
      });
      await audit(tx, actor, {
        action: 'settings.flag',
        entityType: 'FeatureFlag',
        entityId: flag,
        before: { enabled: before },
        after: { enabled },
      });
    });
    this.settings.invalidate();
    return this.readSettings();
  }

  // ─── Audit log ─────────────────────────────────────────────────────────

  async auditLog(query: AdminListQuery, filters: { entityType?: string; entityId?: string }) {
    const where: Prisma.AuditLogWhereInput = {
      ...(filters.entityType ? { entityType: filters.entityType } : {}),
      ...(filters.entityId ? { entityId: filters.entityId } : {}),
      ...(query.q
        ? {
            OR: [
              { action: { contains: query.q } },
              { actorEmail: { contains: query.q.toLowerCase() } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.db.auditLog.findMany({ where, orderBy: { createdAt: query.dir }, ...paging(query) }),
      this.db.auditLog.count({ where }),
    ]);
    return { items, total };
  }
}
