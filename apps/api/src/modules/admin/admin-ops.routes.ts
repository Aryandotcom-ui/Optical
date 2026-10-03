import {
  adminListQuerySchema,
  areasFor,
  couponInputSchema,
  couponUpdateSchema,
  flagUpdateSchema,
  helpArticleInputSchema,
  helpArticleUpdateSchema,
  marketSettingsSchema,
  orderRefundSchema,
  orderTransitionSchema,
  orderUpdateSchema,
  prescriptionReviewSchema,
  publicSettingsSchema,
  reviewModerationSchema,
  roleUpdateSchema,
  type AdminAccess,
  type AdminArea,
} from '@optical/shared/admin';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Db } from '../../infra/prisma';
import { rateLimit, rateLimits, type RateLimiter } from '../../lib/rate-limit';
import type { SettingsService } from '../settings/settings.service';
import { requireStaff } from './access';
import { respond } from './list';
import type { OrdersAdmin } from './orders-admin';
import type { StoreAdmin } from './store-admin';

const id = z.object({ id: z.uuid() });
const tags = ['admin'];

export interface AdminOpsDeps {
  db: Db;
  orders: OrdersAdmin;
  store: StoreAdmin;
  settings: SettingsService;
  limiter: RateLimiter;
}

/** The team's daily work: dashboard, orders, prescriptions, customers, coupons, reviews, help, settings, audit. */
export const adminOpsRoutes: FastifyPluginAsyncZod<AdminOpsDeps> = (app, deps) => {
  const { db, orders, store, settings } = deps;
  const write = rateLimit(deps.limiter, rateLimits.adminWrite);
  const staff = (request: FastifyRequest, area: AdminArea, access: AdminAccess) =>
    requireStaff(db, request, area, access);

  // Team members only, checked before the body is validated, so the admin's
  // shapes are never revealed to anyone else. Each route then checks its area.
  app.addHook('preValidation', async (request) => {
    if (request.url.startsWith('/v1/admin')) await requireStaff(db, request, 'dashboard', 'read');
  });

  app.addHook('onSend', (request, reply, payload, done) => {
    if (request.url.startsWith('/v1/admin')) void reply.header('cache-control', 'no-store');
    done(null, payload);
  });

  // Storefront-facing: the settings the admin can change.
  app.get(
    '/settings',
    {
      schema: {
        tags: ['settings'],
        summary: 'Public store settings',
        response: { 200: publicSettingsSchema },
      },
    },
    async (_request, reply) => {
      void reply.header('cache-control', 'public, max-age=30');
      return settings.publicSettings();
    },
  );

  app.get(
    '/admin/me',
    { schema: { tags, summary: 'The signed-in team member' } },
    async (request) => {
      const actor = await staff(request, 'dashboard', 'read');
      return {
        id: actor.id,
        name: actor.name,
        email: actor.email,
        role: actor.role,
        areas: areasFor(actor.role),
      };
    },
  );

  app.get(
    '/admin/dashboard',
    {
      schema: {
        tags,
        summary: 'Dashboard figures',
        querystring: z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }),
      },
    },
    async (request) => {
      await staff(request, 'dashboard', 'read');
      return store.dashboard(request.query.days);
    },
  );

  // ─── Orders ──────────────────────────────────────────────────────────

  app.get(
    '/admin/orders',
    {
      schema: {
        tags,
        summary: 'List orders',
        querystring: adminListQuerySchema.extend({
          status: z.string().max(30).optional(),
          awaiting: z.stringbool().optional(),
        }),
      },
    },
    async (request, reply) => {
      await staff(request, 'orders', 'read');
      const { status, awaiting, ...query } = request.query;
      const result = await orders.list(query, {
        ...(status ? { status } : {}),
        ...(awaiting === undefined ? {} : { awaiting }),
      });
      return respond(reply, query, result, {
        name: 'orders',
        columns: [
          ['Number', (row) => row.number],
          ['Placed', (row) => row.placedAt],
          ['Customer', (row) => row.customer],
          ['Email', (row) => row.email],
          ['Status', (row) => row.status],
          ['Items', (row) => row.items],
          ['Total (minor)', (row) => row.totalMinor],
          ['Payment', (row) => row.paymentProvider],
          ['Awaiting prescription', (row) => (row.awaitingPrescription ? 'yes' : 'no')],
        ],
      });
    },
  );

  app.get(
    '/admin/orders/:id',
    { schema: { tags, summary: 'Order detail', params: id } },
    async (request) => {
      await staff(request, 'orders', 'read');
      return orders.detail(request.params.id);
    },
  );

  app.post(
    '/admin/orders/:id/transition',
    {
      preHandler: write,
      schema: {
        tags,
        summary: 'Move an order to a new status',
        params: id,
        body: orderTransitionSchema,
      },
    },
    async (request) =>
      orders.transition(await staff(request, 'orders', 'write'), request.params.id, request.body),
  );

  app.patch(
    '/admin/orders/:id',
    {
      preHandler: write,
      schema: { tags, summary: 'Notes and shipment details', params: id, body: orderUpdateSchema },
    },
    async (request) =>
      orders.update(await staff(request, 'orders', 'write'), request.params.id, request.body),
  );

  app.post(
    '/admin/orders/:id/refund',
    {
      preHandler: write,
      schema: { tags, summary: 'Refund a payment', params: id, body: orderRefundSchema },
    },
    async (request) =>
      orders.refund(await staff(request, 'orders', 'write'), request.params.id, request.body),
  );

  // ─── Prescription review queue ───────────────────────────────────────

  app.get(
    '/admin/prescriptions',
    {
      schema: {
        tags,
        summary: 'Prescriptions to review',
        querystring: adminListQuerySchema.extend({ status: z.string().max(30).optional() }),
      },
    },
    async (request) => {
      await staff(request, 'prescriptions', 'read');
      const { status, ...query } = request.query;
      const result = await orders.prescriptions(query, status);
      return { ...result, page: query.page, pageSize: query.pageSize };
    },
  );

  app.get(
    '/admin/prescriptions/:id',
    { schema: { tags, summary: 'A prescription', params: id } },
    async (request) => {
      await staff(request, 'prescriptions', 'read');
      return orders.prescription(request.params.id);
    },
  );

  app.post(
    '/admin/prescriptions/:id/review',
    {
      preHandler: write,
      schema: {
        tags,
        summary: 'Approve or ask for a correction',
        params: id,
        body: prescriptionReviewSchema,
      },
    },
    async (request) =>
      orders.review(
        await staff(request, 'prescriptions', 'write'),
        request.params.id,
        request.body,
      ),
  );

  // ─── Customers ───────────────────────────────────────────────────────

  app.get(
    '/admin/customers',
    { schema: { tags, summary: 'Customers', querystring: adminListQuerySchema } },
    async (request, reply) => {
      await staff(request, 'customers', 'read');
      const result = await store.customers(request.query);
      return respond(reply, request.query, result, {
        name: 'customers',
        columns: [
          ['Name', (row) => row.name],
          ['Email', (row) => row.email],
          ['Role', (row) => row.role],
          ['Orders', (row) => row.orders],
          ['Spent (minor)', (row) => row.spentMinor],
          ['Joined', (row) => row.createdAt],
        ],
      });
    },
  );

  app.get(
    '/admin/customers/:id',
    { schema: { tags, summary: 'A customer', params: id } },
    async (request) => {
      await staff(request, 'customers', 'read');
      return store.customer(request.params.id);
    },
  );

  app.put(
    '/admin/customers/:id/role',
    {
      preHandler: write,
      schema: { tags, summary: 'Change a role (admins only)', params: id, body: roleUpdateSchema },
    },
    async (request) =>
      store.setRole(await staff(request, 'settings', 'write'), request.params.id, request.body),
  );

  // ─── Coupons ─────────────────────────────────────────────────────────

  app.get(
    '/admin/coupons',
    { schema: { tags, summary: 'Coupons', querystring: adminListQuerySchema } },
    async (request, reply) => {
      await staff(request, 'coupons', 'read');
      const result = await store.coupons(request.query);
      return respond(reply, request.query, result, {
        name: 'coupons',
        columns: [
          ['Code', (row) => row.code],
          ['Kind', (row) => row.kind],
          ['Active', (row) => (row.active ? 'yes' : 'no')],
          ['Used', (row) => row.usageCount],
          ['Limit', (row) => row.usageLimit],
          ['Ends', (row) => row.endsAt],
        ],
      });
    },
  );

  app.post(
    '/admin/coupons',
    { preHandler: write, schema: { tags, summary: 'Create a coupon', body: couponInputSchema } },
    async (request, reply) => {
      const actor = await staff(request, 'coupons', 'write');
      void reply.status(201);
      return store.createCoupon(actor, request.body);
    },
  );

  app.patch(
    '/admin/coupons/:id',
    {
      preHandler: write,
      schema: { tags, summary: 'Update a coupon', params: id, body: couponUpdateSchema },
    },
    async (request) =>
      store.updateCoupon(await staff(request, 'coupons', 'write'), request.params.id, request.body),
  );

  // ─── Reviews and help articles ───────────────────────────────────────

  app.get(
    '/admin/reviews',
    {
      schema: {
        tags,
        summary: 'Reviews to moderate',
        querystring: adminListQuerySchema.extend({ status: z.string().max(20).optional() }),
      },
    },
    async (request) => {
      await staff(request, 'reviews', 'read');
      const { status, ...query } = request.query;
      return {
        ...(await store.reviews(query, status)),
        page: query.page,
        pageSize: query.pageSize,
      };
    },
  );

  app.post(
    '/admin/reviews/:id/moderate',
    {
      preHandler: write,
      schema: {
        tags,
        summary: 'Publish or reject a review',
        params: id,
        body: reviewModerationSchema,
      },
    },
    async (request) =>
      store.moderate(
        await staff(request, 'reviews', 'write'),
        request.params.id,
        request.body.status,
      ),
  );

  app.get(
    '/admin/help',
    { schema: { tags, summary: 'Help articles', querystring: adminListQuerySchema } },
    async (request) => {
      await staff(request, 'content', 'read');
      return {
        ...(await store.articles(request.query)),
        page: request.query.page,
        pageSize: request.query.pageSize,
      };
    },
  );

  app.post(
    '/admin/help',
    {
      preHandler: write,
      schema: { tags, summary: 'Add a help article', body: helpArticleInputSchema },
    },
    async (request, reply) => {
      const actor = await staff(request, 'content', 'write');
      void reply.status(201);
      return store.saveArticle(actor, null, request.body);
    },
  );

  app.patch(
    '/admin/help/:id',
    {
      preHandler: write,
      schema: { tags, summary: 'Edit a help article', params: id, body: helpArticleUpdateSchema },
    },
    async (request) =>
      store.saveArticle(await staff(request, 'content', 'write'), request.params.id, request.body),
  );

  app.delete(
    '/admin/help/:id',
    { preHandler: write, schema: { tags, summary: 'Delete a help article', params: id } },
    async (request) =>
      store.deleteArticle(await staff(request, 'content', 'write'), request.params.id),
  );

  // ─── Settings and audit ──────────────────────────────────────────────

  app.get('/admin/settings', { schema: { tags, summary: 'Store settings' } }, async (request) => {
    await staff(request, 'settings', 'read');
    return store.readSettings();
  });

  app.put(
    '/admin/settings/market',
    {
      preHandler: write,
      schema: { tags, summary: 'Shipping, COD and stock thresholds', body: marketSettingsSchema },
    },
    async (request) => store.saveMarket(await staff(request, 'settings', 'write'), request.body),
  );

  app.put(
    '/admin/settings/flags/:key',
    {
      preHandler: write,
      schema: {
        tags,
        summary: 'Switch a feature',
        params: z.object({ key: z.string().max(40) }),
        body: flagUpdateSchema,
      },
    },
    async (request) =>
      store.setFlag(
        await staff(request, 'settings', 'write'),
        request.params.key,
        request.body.enabled,
      ),
  );

  app.get(
    '/admin/audit',
    {
      schema: {
        tags,
        summary: 'Audit log',
        querystring: adminListQuerySchema.extend({
          entityType: z.string().max(40).optional(),
          entityId: z.string().max(200).optional(),
        }),
      },
    },
    async (request, reply) => {
      await staff(request, 'audit', 'read');
      const { entityType, entityId, ...query } = request.query;
      const result = await store.auditLog(query, {
        ...(entityType ? { entityType } : {}),
        ...(entityId ? { entityId } : {}),
      });
      return respond(reply, query, result, {
        name: 'audit-log',
        columns: [
          ['When', (row) => row.createdAt],
          ['Who', (row) => row.actorEmail],
          ['Action', (row) => row.action],
          ['Entity', (row) => `${row.entityType}:${row.entityId}`],
          ['Before', (row) => JSON.stringify(row.before)],
          ['After', (row) => JSON.stringify(row.after)],
        ],
      });
    },
  );
  return Promise.resolve();
};
