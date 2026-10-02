import {
  addressInputSchema,
  changePasswordSchema,
  deleteAccountSchema,
  orderListSchema,
  prescriptionInputSchema,
  renamePrescriptionSchema,
  savedAddressSchema,
  savedPrescriptionSchema,
  updateProfileSchema,
  userSchema,
  wishlistMergeSchema,
  wishlistSchema,
} from '@optical/shared/account';
import { apiErrorSchema } from '@optical/shared/api';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { rateLimit, rateLimits, type RateLimiter } from '../../lib/rate-limit';
import type { AuthService } from '../auth/auth.service';
import type { AccountService } from './account.service';
import type { AddressService } from './addresses';
import type { AccountPrescriptions } from './prescriptions';
import type { WishlistService } from './wishlist';

const errors = {
  401: apiErrorSchema,
  403: apiErrorSchema,
  404: apiErrorSchema,
  409: apiErrorSchema,
  422: apiErrorSchema,
  429: apiErrorSchema,
};
const idParams = z.object({ id: z.uuid() });
const productParams = z.object({ productId: z.uuid() });

export interface AccountRouteDeps {
  account: AccountService;
  auth: AuthService;
  addresses: AddressService;
  prescriptions: AccountPrescriptions;
  wishlist: WishlistService;
  limiter: RateLimiter;
}

const userId = async (request: FastifyRequest) => (await request.requireUser()).userId;

/** Everything under /account needs a signed-in customer and is never cached. */
export const accountRoutes: FastifyPluginAsyncZod<AccountRouteDeps> = (app, deps) => {
  const { account, auth, addresses, prescriptions, wishlist, limiter } = deps;
  const write = rateLimit(limiter, rateLimits.accountWrite);
  const passwordCheck = rateLimit(limiter, rateLimits.passwordCheck);
  const tags = ['account'];

  app.addHook('onSend', (_request, reply, payload, done) => {
    void reply.header('cache-control', 'no-store');
    done(null, payload);
  });

  // ─── Profile and security ───────────────────────────────────────────────
  app.patch(
    '/account/profile',
    {
      preHandler: write,
      schema: {
        tags,
        summary: 'Update your profile',
        body: updateProfileSchema,
        response: { 200: userSchema, ...errors },
      },
    },
    async (request) => account.updateProfile(await userId(request), request.body),
  );

  app.post(
    '/account/password',
    {
      preHandler: passwordCheck,
      schema: {
        tags,
        summary: 'Change your password',
        description: 'Keeps this device signed in and signs out every other device.',
        body: changePasswordSchema,
        response: { 204: z.null(), ...errors },
      },
    },
    async (request, reply) => {
      const user = await request.requireUser();
      await auth.changePassword(user.userId, user.familyId, request.body);
      return reply.status(204).send(null);
    },
  );

  app.get(
    '/account/export',
    {
      schema: {
        tags,
        summary: 'Download your data',
        description: 'Profile, addresses, saved prescriptions, orders and wishlist as JSON.',
        response: { 200: z.record(z.string(), z.unknown()), ...errors },
      },
    },
    async (request, reply) => {
      const data = await account.exportData(await userId(request));
      void reply.header('content-disposition', 'attachment; filename="lumen-account-data.json"');
      return data;
    },
  );

  app.post(
    '/account/delete',
    {
      preHandler: passwordCheck,
      schema: {
        tags,
        summary: 'Delete your account',
        description:
          'Needs your password. Refused while an order is being made or delivered. Past orders are kept for tax records, without a link to the account.',
        body: deleteAccountSchema,
        response: { 204: z.null(), ...errors },
      },
    },
    async (request, reply) => {
      await account.deleteAccount(await userId(request), request.body.password);
      reply.clearAuthCookies();
      return reply.status(204).send(null);
    },
  );

  // ─── Orders ─────────────────────────────────────────────────────────────
  app.get(
    '/account/orders',
    {
      schema: {
        tags,
        summary: 'Your orders',
        description: 'Newest first, ten per page. Open one with GET /v1/orders/{number}.',
        querystring: z.object({ page: z.coerce.number().int().min(1).max(1000).default(1) }),
        response: { 200: orderListSchema, ...errors },
      },
    },
    async (request) => account.orders(await userId(request), request.query.page),
  );

  // ─── Addresses ──────────────────────────────────────────────────────────
  const addressList = z.array(savedAddressSchema);
  app.get(
    '/account/addresses',
    { schema: { tags, summary: 'Saved addresses', response: { 200: addressList, ...errors } } },
    async (request) => addresses.list(await userId(request)),
  );
  app.post(
    '/account/addresses',
    {
      preHandler: write,
      schema: {
        tags,
        summary: 'Save an address',
        body: addressInputSchema,
        response: { 201: savedAddressSchema, ...errors },
      },
    },
    async (request, reply) =>
      reply.status(201).send(await addresses.create(await userId(request), request.body)),
  );
  app.put(
    '/account/addresses/:id',
    {
      preHandler: write,
      schema: {
        tags,
        summary: 'Edit an address',
        params: idParams,
        body: addressInputSchema,
        response: { 200: savedAddressSchema, ...errors },
      },
    },
    async (request) => addresses.update(await userId(request), request.params.id, request.body),
  );
  app.post(
    '/account/addresses/:id/default',
    {
      preHandler: write,
      schema: {
        tags,
        summary: 'Make an address the default',
        params: idParams,
        response: { 200: addressList, ...errors },
      },
    },
    async (request) => addresses.setDefault(await userId(request), request.params.id),
  );
  app.delete(
    '/account/addresses/:id',
    {
      preHandler: write,
      schema: {
        tags,
        summary: 'Delete an address',
        params: idParams,
        response: { 200: addressList, ...errors },
      },
    },
    async (request) => addresses.remove(await userId(request), request.params.id),
  );

  // ─── Prescriptions ──────────────────────────────────────────────────────
  const prescriptionList = z.array(savedPrescriptionSchema);
  app.get(
    '/account/prescriptions',
    {
      schema: {
        tags,
        summary: 'Saved prescriptions',
        description:
          'The latest version of each, with earlier versions in `history` and an expiry flag.',
        response: { 200: prescriptionList, ...errors },
      },
    },
    async (request) => prescriptions.list(await userId(request)),
  );
  app.post(
    '/account/prescriptions',
    {
      preHandler: write,
      schema: {
        tags,
        summary: 'Save a prescription',
        body: prescriptionInputSchema,
        response: { 201: savedPrescriptionSchema, ...errors },
      },
    },
    async (request, reply) =>
      reply.status(201).send(await prescriptions.create(await userId(request), request.body)),
  );
  app.put(
    '/account/prescriptions/:id',
    {
      preHandler: write,
      schema: {
        tags,
        summary: 'Update a prescription',
        description:
          'Adds a new version; the previous values stay in its history and on past orders.',
        params: idParams,
        body: prescriptionInputSchema,
        response: { 200: savedPrescriptionSchema, ...errors },
      },
    },
    async (request) => prescriptions.update(await userId(request), request.params.id, request.body),
  );
  app.patch(
    '/account/prescriptions/:id',
    {
      preHandler: write,
      schema: {
        tags,
        summary: 'Rename a prescription',
        params: idParams,
        body: renamePrescriptionSchema,
        response: { 200: prescriptionList, ...errors },
      },
    },
    async (request) =>
      prescriptions.rename(await userId(request), request.params.id, request.body.label),
  );
  app.delete(
    '/account/prescriptions/:id',
    {
      preHandler: write,
      schema: {
        tags,
        summary: 'Delete a prescription',
        description:
          'Deletes every version. Values and files are erased unless an order needs them.',
        params: idParams,
        response: { 200: prescriptionList, ...errors },
      },
    },
    async (request) => prescriptions.remove(await userId(request), request.params.id),
  );

  // ─── Wishlist ───────────────────────────────────────────────────────────
  app.get(
    '/account/wishlist',
    { schema: { tags, summary: 'Your wishlist', response: { 200: wishlistSchema, ...errors } } },
    async (request) => wishlist.get(await userId(request)),
  );
  app.post(
    '/account/wishlist/merge',
    {
      preHandler: write,
      schema: {
        tags,
        summary: 'Merge a browser wishlist',
        description:
          'Adds frames saved in this browser before signing in. Returns the combined list.',
        body: wishlistMergeSchema,
        response: { 200: wishlistSchema, ...errors },
      },
    },
    async (request) => wishlist.merge(await userId(request), request.body.items),
  );
  app.put(
    '/account/wishlist/items/:productId',
    {
      preHandler: write,
      schema: {
        tags,
        summary: 'Save a frame',
        params: productParams,
        response: { 200: wishlistSchema, ...errors },
      },
    },
    async (request) => wishlist.add(await userId(request), request.params.productId),
  );
  app.delete(
    '/account/wishlist/items/:productId',
    {
      preHandler: write,
      schema: {
        tags,
        summary: 'Remove a frame',
        params: productParams,
        response: { 200: wishlistSchema, ...errors },
      },
    },
    async (request) => wishlist.remove(await userId(request), request.params.productId),
  );
  app.post(
    '/account/wishlist/share',
    {
      preHandler: write,
      schema: {
        tags,
        summary: 'Get a new share link',
        description: 'Replaces the read-only link; the old link stops working.',
        response: { 200: wishlistSchema, ...errors },
      },
    },
    async (request) => wishlist.resetShareLink(await userId(request)),
  );

  app.get(
    '/wishlists/:token',
    {
      schema: {
        tags: ['wishlist'],
        summary: 'A shared wishlist',
        description: 'Read-only. Shows the frames, never who saved them.',
        params: z.object({ token: z.string().max(64) }),
        response: {
          200: z.object({ items: z.array(z.object({ id: z.uuid(), slug: z.string() })) }),
          404: apiErrorSchema,
        },
      },
    },
    (request) => wishlist.shared(request.params.token),
  );

  return Promise.resolve();
};
