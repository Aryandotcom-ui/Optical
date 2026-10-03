import { randomUUID } from 'node:crypto';
import {
  type productBulkSchema,
  type productCreateSchema,
  type productUpdateSchema,
  type stockAdjustSchema,
  type stockThresholdSchema,
  type variantInputSchema,
  type variantUpdateSchema,
  type AdminListQuery,
  type imageKinds,
} from '@optical/shared/admin';

type ImageKind = (typeof imageKinds)[number];
import type { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client';
import type { Db } from '../../infra/prisma';
import type { StorageProvider } from '../../infra/storage';
import { AppError } from '../../lib/app-error';
import type { Cache } from '../../lib/cache';
import { detectFileType, stripMetadata, uploadTypes } from '../../lib/file-sanitiser';
import { imageSize } from '../../lib/image-size';
import { CATALOG_CACHE } from '../catalog/catalog.service';
import type { SettingsService } from '../settings/settings.service';
import { audit, type Actor } from './access';
import { paging, sortBy } from './list';

const productListInclude = {
  category: { select: { slug: true, name: true } },
  variants: { select: { id: true, stock: { select: { onHand: true, reserved: true } } } },
} satisfies Prisma.ProductInclude;

const productDetailInclude = {
  category: { select: { slug: true, name: true } },
  frame: true,
  faceShapes: true,
  variants: { orderBy: { position: 'asc' }, include: { stock: true } },
  images: { orderBy: { position: 'asc' } },
} satisfies Prisma.ProductInclude;

/**
 * Products, variants, images and stock for the admin. Every change is
 * audited and clears the storefront's catalogue cache, so it shows at once.
 */
export class CatalogAdmin {
  constructor(
    private readonly db: Db,
    private readonly cache: Cache,
    private readonly storage: StorageProvider,
    private readonly settings: SettingsService,
    private readonly mediaBaseUrl: string,
  ) {}

  private refresh() {
    return this.cache.invalidate(CATALOG_CACHE);
  }

  async listProducts(query: AdminListQuery, filters: { status?: string; category?: string }) {
    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' } },
              { slug: { contains: query.q.toLowerCase() } },
              { variants: { some: { sku: { contains: query.q.toUpperCase() } } } },
            ],
          }
        : {}),
      ...(filters.status === 'published' ? { isPublished: true } : {}),
      ...(filters.status === 'draft' ? { isPublished: false } : {}),
      ...(filters.category ? { category: { slug: filters.category } } : {}),
    };
    const column = sortBy(
      query,
      ['name', 'basePriceMinor', 'updatedAt', 'ratingAverage'],
      'updatedAt',
    );
    const [rows, total] = await Promise.all([
      this.db.product.findMany({
        where,
        include: productListInclude,
        orderBy: { [column]: query.dir },
        ...paging(query),
      }),
      this.db.product.count({ where }),
    ]);
    const items = rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      category: row.category.name,
      basePriceMinor: row.basePriceMinor,
      isPublished: row.isPublished,
      variants: row.variants.length,
      available: row.variants.reduce(
        (sum, variant) =>
          sum + Math.max(0, (variant.stock?.onHand ?? 0) - (variant.stock?.reserved ?? 0)),
        0,
      ),
      ratingAverage: row.ratingAverage,
      updatedAt: row.updatedAt,
    }));
    return { items, total };
  }

  async product(id: string) {
    const product = await this.db.product.findFirst({
      where: { id, deletedAt: null },
      include: productDetailInclude,
    });
    if (!product) throw new AppError('NOT_FOUND', 'That product does not exist.');
    const { searchText: _searchText, ...rest } = product;
    return rest;
  }

  async createProduct(actor: Actor, input: z.infer<typeof productCreateSchema>) {
    const category = await this.db.category.findUnique({ where: { slug: input.categorySlug } });
    if (!category) throw new AppError('VALIDATION_FAILED', 'Choose a category that exists.');
    if (await this.db.product.findUnique({ where: { slug: input.slug } }))
      throw new AppError('CONFLICT', 'Another product already uses that address (slug).');
    const created = await this.db.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          slug: input.slug,
          name: input.name,
          type: input.type,
          categoryId: category.id,
          description: input.description,
          materialsAndCare: '',
          basePriceMinor: input.basePriceMinor,
          searchText: input.name.toLowerCase(),
          // New products start as drafts: nothing is visible until published.
          isPublished: false,
        },
      });
      await audit(tx, actor, {
        action: 'product.create',
        entityType: 'Product',
        entityId: product.id,
        after: product,
      });
      return product;
    });
    return this.product(created.id);
  }

  async updateProduct(actor: Actor, id: string, input: z.infer<typeof productUpdateSchema>) {
    const before = await this.product(id);
    const { frame, faceShapes, ...fields } = input;
    if (fields.isPublished && before.variants.filter((variant) => variant.isActive).length === 0)
      throw new AppError('CONFLICT', 'Add at least one active colour before publishing.');
    await this.db.$transaction(async (tx) => {
      await tx.product.update({
        where: { id },
        data: { ...fields, ...(fields.name ? { searchText: fields.name.toLowerCase() } : {}) },
      });
      if (frame) {
        const data = {
          ...frame,
          hinge: before.frame?.hinge ?? 'standard',
          features: before.frame?.features ?? [],
        };
        await tx.frameSpec.upsert({
          where: { productId: id },
          create: { productId: id, ...data },
          update: frame,
        });
      }
      if (faceShapes) {
        await tx.faceShapeAffinity.deleteMany({ where: { productId: id } });
        await tx.faceShapeAffinity.createMany({
          data: faceShapes.map((entry) => ({ productId: id, ...entry })),
        });
      }
      await audit(tx, actor, {
        action: 'product.update',
        entityType: 'Product',
        entityId: id,
        before,
        after: input,
      });
    });
    await this.refresh();
    return this.product(id);
  }

  async bulk(actor: Actor, input: z.infer<typeof productBulkSchema>) {
    const data: Prisma.ProductUpdateManyMutationInput =
      input.action === 'publish'
        ? { isPublished: true }
        : input.action === 'unpublish'
          ? { isPublished: false }
          : { isPublished: false, deletedAt: new Date() };
    const where: Prisma.ProductWhereInput = {
      id: { in: input.ids },
      deletedAt: null,
      // Publishing needs a sellable colour; the rest are skipped and counted.
      ...(input.action === 'publish' ? { variants: { some: { isActive: true } } } : {}),
    };
    const updated = await this.db.$transaction(async (tx) => {
      const result = await tx.product.updateMany({ where, data });
      await audit(tx, actor, {
        action: `product.bulk.${input.action}`,
        entityType: 'Product',
        entityId: input.ids.join(','),
        after: { ids: input.ids, updated: result.count },
      });
      return result.count;
    });
    await this.refresh();
    return { updated, skipped: input.ids.length - updated };
  }

  async createVariant(actor: Actor, productId: string, input: z.infer<typeof variantInputSchema>) {
    await this.product(productId);
    if (await this.db.productVariant.findUnique({ where: { sku: input.sku } }))
      throw new AppError('CONFLICT', 'Another colour already uses that SKU.');
    const threshold = (await this.settings.marketSettings()).lowStockThreshold;
    await this.db.$transaction(async (tx) => {
      const position = await tx.productVariant.count({ where: { productId } });
      const variant = await tx.productVariant.create({
        data: { ...input, productId, position, isDefault: position === 0 },
      });
      await tx.stockItem.create({
        data: { variantId: variant.id, onHand: 0, lowStockThreshold: threshold },
      });
      await audit(tx, actor, {
        action: 'variant.create',
        entityType: 'ProductVariant',
        entityId: variant.id,
        after: variant,
      });
    });
    await this.refresh();
    return this.product(productId);
  }

  async updateVariant(actor: Actor, variantId: string, input: z.infer<typeof variantUpdateSchema>) {
    const before = await this.db.productVariant.findUnique({ where: { id: variantId } });
    if (!before) throw new AppError('NOT_FOUND', 'That colour does not exist.');
    await this.db.$transaction(async (tx) => {
      const after = await tx.productVariant.update({ where: { id: variantId }, data: input });
      await audit(tx, actor, {
        action: 'variant.update',
        entityType: 'ProductVariant',
        entityId: variantId,
        before,
        after,
      });
    });
    await this.refresh();
    return this.product(before.productId);
  }

  async addImage(
    actor: Actor,
    productId: string,
    data: Buffer,
    image: { alt: string; kind: ImageKind },
  ) {
    await this.product(productId);
    const mime = detectFileType(data);
    if (!mime || mime === 'application/pdf')
      throw new AppError('UNSUPPORTED_MEDIA_TYPE', 'Upload a JPEG, PNG or WebP image.');
    const clean = stripMetadata(data, mime);
    const size = imageSize(clean);
    if (!size) throw new AppError('VALIDATION_FAILED', 'We could not read that image.');
    const key = `catalog/${randomUUID()}.${uploadTypes[mime]}`;
    await this.storage.put(key, clean);
    await this.db.$transaction(async (tx) => {
      const position = await tx.productImage.count({ where: { productId } });
      const created = await tx.productImage.create({
        data: {
          productId,
          url: `${this.mediaBaseUrl}/v1/media/${key}`,
          alt: image.alt || 'Product photo',
          width: size.width,
          height: size.height,
          kind: image.kind,
          position,
        },
      });
      await audit(tx, actor, {
        action: 'image.add',
        entityType: 'ProductImage',
        entityId: created.id,
        after: created,
      });
    });
    await this.refresh();
    return this.product(productId);
  }

  async reorderImages(actor: Actor, productId: string, ids: string[]) {
    const product = await this.product(productId);
    const known = new Set(product.images.map((image) => image.id));
    if (ids.length !== known.size || ids.some((id) => !known.has(id)))
      throw new AppError(
        'VALIDATION_FAILED',
        'Send every image of this product, in the new order.',
      );
    await this.db.$transaction(async (tx) => {
      for (const [position, id] of ids.entries())
        await tx.productImage.update({ where: { id }, data: { position } });
      await audit(tx, actor, {
        action: 'image.reorder',
        entityType: 'Product',
        entityId: productId,
        before: product.images.map((image) => image.id),
        after: ids,
      });
    });
    await this.refresh();
    return this.product(productId);
  }

  async removeImage(actor: Actor, imageId: string) {
    const image = await this.db.productImage.findUnique({ where: { id: imageId } });
    if (!image) throw new AppError('NOT_FOUND', 'That image does not exist.');
    await this.db.$transaction(async (tx) => {
      await tx.productImage.delete({ where: { id: imageId } });
      await audit(tx, actor, {
        action: 'image.remove',
        entityType: 'ProductImage',
        entityId: imageId,
        before: image,
      });
    });
    const key = /\/v1\/media\/(catalog\/.+)$/.exec(image.url)?.[1];
    if (key) await this.storage.delete(key).catch(() => undefined);
    await this.refresh();
    return this.product(image.productId);
  }

  // ─── Inventory ─────────────────────────────────────────────────────────

  async inventory(query: AdminListQuery, filters: { low?: boolean }) {
    const search = query.q
      ? {
          OR: [
            { sku: { contains: query.q.toUpperCase() } },
            { product: { name: { contains: query.q, mode: 'insensitive' as const } } },
          ],
        }
      : {};
    const rows = await this.db.productVariant.findMany({
      where: { product: { deletedAt: null }, ...search },
      include: { stock: true, product: { select: { name: true, id: true } } },
      orderBy: [{ product: { name: 'asc' } }, { position: 'asc' }],
    });
    let items = rows.map((row) => {
      const onHand = row.stock?.onHand ?? 0;
      const reserved = row.stock?.reserved ?? 0;
      const threshold = row.stock?.lowStockThreshold ?? 0;
      return {
        variantId: row.id,
        productId: row.product.id,
        sku: row.sku,
        product: row.product.name,
        colour: row.colourName,
        onHand,
        reserved,
        available: onHand - reserved,
        lowStockThreshold: threshold,
        low: onHand - reserved <= threshold,
      };
    });
    if (filters.low) items = items.filter((item) => item.low);
    const column = sortBy(query, ['available', 'product', 'sku'], 'product');
    items.sort((a, b) => {
      const order = a[column] < b[column] ? -1 : a[column] > b[column] ? 1 : 0;
      return query.dir === 'asc' ? order : -order;
    });
    const { skip, take } = paging(query);
    return { items: items.slice(skip, skip + take), total: items.length };
  }

  async adjustStock(actor: Actor, variantId: string, input: z.infer<typeof stockAdjustSchema>) {
    return this.db.$transaction(async (tx) => {
      const stock = await tx.stockItem.findUnique({ where: { variantId } });
      if (!stock) throw new AppError('NOT_FOUND', 'That colour has no stock record.');
      if (stock.onHand + input.delta < stock.reserved)
        throw new AppError(
          'CONFLICT',
          `Only ${stock.onHand - stock.reserved} unreserved units can be removed.`,
        );
      const after = await tx.stockItem.update({
        where: { variantId },
        data: { onHand: { increment: input.delta } },
      });
      await tx.stockAdjustment.create({
        data: { variantId, delta: input.delta, reason: input.reason, actorId: actor.id },
      });
      await audit(tx, actor, {
        action: 'stock.adjust',
        entityType: 'StockItem',
        entityId: variantId,
        before: stock,
        after,
      });
      await this.refresh();
      return after;
    });
  }

  async setThreshold(actor: Actor, variantId: string, input: z.infer<typeof stockThresholdSchema>) {
    const before = await this.db.stockItem.findUnique({ where: { variantId } });
    if (!before) throw new AppError('NOT_FOUND', 'That colour has no stock record.');
    return this.db.$transaction(async (tx) => {
      const after = await tx.stockItem.update({ where: { variantId }, data: input });
      await audit(tx, actor, {
        action: 'stock.threshold',
        entityType: 'StockItem',
        entityId: variantId,
        before,
        after,
      });
      return after;
    });
  }

  async stockHistory(variantId: string) {
    return this.db.stockAdjustment.findMany({
      where: { variantId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  /** Public bytes of an uploaded catalogue image. */
  async media(key: string): Promise<Buffer | null> {
    if (!key.startsWith('catalog/')) return null;
    try {
      return await this.storage.get(key);
    } catch {
      return null;
    }
  }
}
