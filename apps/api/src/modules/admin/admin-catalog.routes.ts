import type {} from '@fastify/multipart';
import {
  adminListQuerySchema,
  imageKinds,
  imageOrderSchema,
  lensKinds,
  lensOptionUpdateSchema,
  lensRuleUpdateSchema,
  productBulkSchema,
  productCreateSchema,
  productUpdateSchema,
  stockAdjustSchema,
  stockThresholdSchema,
  variantInputSchema,
  variantUpdateSchema,
} from '@optical/shared/admin';
import type { AdminArea, AdminAccess } from '@optical/shared/admin';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Db } from '../../infra/prisma';
import { AppError } from '../../lib/app-error';
import { rateLimit, rateLimits, type RateLimiter } from '../../lib/rate-limit';
import { requireStaff } from './access';
import type { CatalogAdmin } from './catalog-admin';
import { respond } from './list';
import type { StoreAdmin } from './store-admin';

const id = z.object({ id: z.uuid() });
const tags = ['admin'];
const imageQuery = z.object({ kind: z.enum(imageKinds).default('front') });

export interface AdminCatalogDeps {
  db: Db;
  catalog: CatalogAdmin;
  store: StoreAdmin;
  limiter: RateLimiter;
}

/** Products, colours, images, stock and the lens catalogue. */
export const adminCatalogRoutes: FastifyPluginAsyncZod<AdminCatalogDeps> = (app, deps) => {
  const { db, catalog, store } = deps;
  const write = rateLimit(deps.limiter, rateLimits.adminWrite);
  const staff = (request: FastifyRequest, area: AdminArea, access: AdminAccess) =>
    requireStaff(db, request, area, access);

  // Team members only, checked before the body is validated, so the admin's
  // shapes are never revealed to anyone else. Each route then checks its area.
  app.addHook('preValidation', async (request) => {
    if (request.url.startsWith('/v1/admin')) await requireStaff(db, request, 'dashboard', 'read');
  });

  app.get(
    '/admin/products',
    {
      schema: {
        tags,
        summary: 'List products',
        querystring: adminListQuerySchema.extend({
          status: z.enum(['all', 'published', 'draft']).default('all'),
          category: z.string().max(40).optional(),
        }),
      },
    },
    async (request, reply) => {
      await staff(request, 'products', 'read');
      const { status, category, ...query } = request.query;
      const result = await catalog.listProducts(query, {
        status,
        ...(category ? { category } : {}),
      });
      return respond(reply, query, result, {
        name: 'products',
        columns: [
          ['Name', (row) => row.name],
          ['Slug', (row) => row.slug],
          ['Category', (row) => row.category],
          ['Price (minor)', (row) => row.basePriceMinor],
          ['Published', (row) => (row.isPublished ? 'yes' : 'no')],
          ['Colours', (row) => row.variants],
          ['Available', (row) => row.available],
          ['Updated', (row) => row.updatedAt],
        ],
      });
    },
  );

  app.get(
    '/admin/products/:id',
    { schema: { tags, summary: 'Product detail', params: id } },
    async (request) => {
      await staff(request, 'products', 'read');
      return catalog.product(request.params.id);
    },
  );

  app.post(
    '/admin/products',
    {
      preHandler: write,
      schema: { tags, summary: 'Create a draft product', body: productCreateSchema },
    },
    async (request, reply) => {
      const actor = await staff(request, 'products', 'write');
      void reply.status(201);
      return catalog.createProduct(actor, request.body);
    },
  );

  app.patch(
    '/admin/products/:id',
    {
      preHandler: write,
      schema: { tags, summary: 'Update a product', params: id, body: productUpdateSchema },
    },
    async (request) =>
      catalog.updateProduct(
        await staff(request, 'products', 'write'),
        request.params.id,
        request.body,
      ),
  );

  app.post(
    '/admin/products/bulk',
    {
      preHandler: write,
      schema: { tags, summary: 'Publish, unpublish or archive products', body: productBulkSchema },
    },
    async (request) => catalog.bulk(await staff(request, 'products', 'write'), request.body),
  );

  app.post(
    '/admin/products/:id/variants',
    {
      preHandler: write,
      schema: { tags, summary: 'Add a colour', params: id, body: variantInputSchema },
    },
    async (request) =>
      catalog.createVariant(
        await staff(request, 'products', 'write'),
        request.params.id,
        request.body,
      ),
  );

  app.patch(
    '/admin/variants/:id',
    {
      preHandler: write,
      schema: { tags, summary: 'Update a colour', params: id, body: variantUpdateSchema },
    },
    async (request) =>
      catalog.updateVariant(
        await staff(request, 'products', 'write'),
        request.params.id,
        request.body,
      ),
  );

  app.post(
    '/admin/products/:id/images',
    {
      preHandler: write,
      schema: {
        tags,
        summary: 'Upload a product image',
        params: id,
        consumes: ['multipart/form-data'],
      },
    },
    async (request) => {
      const actor = await staff(request, 'products', 'write');
      const file = await request.file();
      if (!file) throw new AppError('VALIDATION_FAILED', 'Attach an image.');
      const data = await file.toBuffer();
      const alt = file.filename
        .replace(/\.[a-z0-9]+$/i, '')
        .replaceAll(/[-_]+/g, ' ')
        .slice(0, 120);
      return catalog.addImage(actor, request.params.id, data, {
        alt,
        kind: imageQuery.parse(request.query).kind,
      });
    },
  );

  app.put(
    '/admin/products/:id/images/order',
    {
      preHandler: write,
      schema: { tags, summary: 'Reorder images', params: id, body: imageOrderSchema },
    },
    async (request) =>
      catalog.reorderImages(
        await staff(request, 'products', 'write'),
        request.params.id,
        request.body.ids,
      ),
  );

  app.delete(
    '/admin/images/:id',
    { preHandler: write, schema: { tags, summary: 'Remove an image', params: id } },
    async (request) =>
      catalog.removeImage(await staff(request, 'products', 'write'), request.params.id),
  );

  // ─── Inventory ───────────────────────────────────────────────────────

  app.get(
    '/admin/inventory',
    {
      schema: {
        tags,
        summary: 'Stock per colour',
        querystring: adminListQuerySchema.extend({ low: z.stringbool().optional() }),
      },
    },
    async (request, reply) => {
      await staff(request, 'inventory', 'read');
      const { low, ...query } = request.query;
      const result = await catalog.inventory(query, low === undefined ? {} : { low });
      return respond(reply, query, result, {
        name: 'inventory',
        columns: [
          ['SKU', (row) => row.sku],
          ['Product', (row) => row.product],
          ['Colour', (row) => row.colour],
          ['On hand', (row) => row.onHand],
          ['Reserved', (row) => row.reserved],
          ['Available', (row) => row.available],
          ['Low-stock threshold', (row) => row.lowStockThreshold],
        ],
      });
    },
  );

  app.post(
    '/admin/inventory/:id/adjust',
    {
      preHandler: write,
      schema: { tags, summary: 'Adjust stock', params: id, body: stockAdjustSchema },
    },
    async (request) =>
      catalog.adjustStock(
        await staff(request, 'inventory', 'write'),
        request.params.id,
        request.body,
      ),
  );

  app.patch(
    '/admin/inventory/:id',
    {
      preHandler: write,
      schema: {
        tags,
        summary: 'Set the low-stock threshold',
        params: id,
        body: stockThresholdSchema,
      },
    },
    async (request) =>
      catalog.setThreshold(
        await staff(request, 'inventory', 'write'),
        request.params.id,
        request.body,
      ),
  );

  app.get(
    '/admin/inventory/:id/history',
    { schema: { tags, summary: 'Stock adjustments', params: id } },
    async (request) => {
      await staff(request, 'inventory', 'read');
      return catalog.stockHistory(request.params.id);
    },
  );

  // ─── Lens catalogue ──────────────────────────────────────────────────

  app.get('/admin/lens', { schema: { tags, summary: 'Lens catalogue' } }, async (request) => {
    await staff(request, 'lens', 'read');
    return store.lens();
  });

  app.patch(
    '/admin/lens/:kind/:code',
    {
      preHandler: write,
      schema: {
        tags,
        summary: 'Update a lens option',
        params: z.object({ kind: z.enum(lensKinds), code: z.string().regex(/^[a-z0-9-]{1,40}$/) }),
        body: lensOptionUpdateSchema,
      },
    },
    async (request) =>
      store.updateLensOption(
        await staff(request, 'lens', 'write'),
        request.params.kind,
        request.params.code,
        request.body,
      ),
  );

  app.patch(
    '/admin/lens-rules/:id',
    {
      preHandler: write,
      schema: {
        tags,
        summary: 'Update a compatibility rule',
        params: z.object({ id: z.string().regex(/^[a-z0-9-]{1,60}$/) }),
        body: lensRuleUpdateSchema,
      },
    },
    async (request) =>
      store.updateLensRule(await staff(request, 'lens', 'write'), request.params.id, request.body),
  );

  // Uploaded catalogue images are public, like the renders.
  app.get(
    '/media/catalog/:file',
    {
      schema: {
        tags: ['catalogue'],
        summary: 'A product image uploaded in the admin',
        params: z.object({ file: z.string().regex(/^[0-9a-f-]{36}\.(jpg|png|webp)$/) }),
      },
    },
    async (request, reply) => {
      const data = await catalog.media(`catalog/${request.params.file}`);
      if (!data) throw new AppError('NOT_FOUND', 'That image does not exist.');
      const ext = request.params.file.split('.').pop();
      void reply
        .header('content-type', ext === 'jpg' ? 'image/jpeg' : `image/${ext ?? 'webp'}`)
        .header('cache-control', 'public, max-age=31536000, immutable');
      return reply.send(data);
    },
  );
  return Promise.resolve();
};
