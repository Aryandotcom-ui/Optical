import { apiErrorSchema } from '@optical/shared/api';
import {
  addCartItemSchema,
  applyCouponSchema,
  cartSchema,
  updateCartItemSchema,
} from '@optical/shared/checkout';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { rateLimit, rateLimits, type RateLimiter } from '../../lib/rate-limit';
import type { CartService } from './cart.service';

const errors = {
  404: apiErrorSchema,
  409: apiErrorSchema,
  422: apiErrorSchema,
  429: apiErrorSchema,
};
const itemParams = z.object({ itemId: z.uuid() });

export const cartRoutes: FastifyPluginAsyncZod<{ service: CartService; limiter: RateLimiter }> = (
  app,
  { service, limiter },
) => {
  // Bags are personal: never cached anywhere.
  app.addHook('onSend', (_request, reply, payload, done) => {
    void reply.header('cache-control', 'no-store');
    done(null, payload);
  });
  const writeLimit = rateLimit(limiter, rateLimits.cartWrite);

  app.get(
    '/cart',
    {
      schema: {
        tags: ['cart'],
        summary: 'Your bag',
        description:
          'The bag for this browser (guest session cookie), priced for standard delivery. An empty bag is returned when there is no session yet.',
        response: { 200: cartSchema },
      },
    },
    async (request) => service.view(await request.owner()),
  );

  app.post(
    '/cart/items',
    {
      preHandler: writeLimit,
      schema: {
        tags: ['cart'],
        summary: 'Add to bag',
        description:
          'Adds a frame (with optional lens configuration). The server re-quotes the lenses against the frame and the compatibility rules and stores the result as a snapshot. With `expectedUnitPriceMinor`, a different server price returns `PRICE_CHANGED` and nothing is added. Starts a guest session if needed.',
        body: addCartItemSchema,
        response: { 200: cartSchema, ...errors },
      },
    },
    async (request, reply) => service.addItem(await reply.ensureOwner(), request.body),
  );

  app.patch(
    '/cart/items/:itemId',
    {
      preHandler: writeLimit,
      schema: {
        tags: ['cart'],
        summary: 'Change quantity',
        params: itemParams,
        body: updateCartItemSchema,
        response: { 200: cartSchema, ...errors },
      },
    },
    async (request) =>
      service.updateQuantity(await request.owner(), request.params.itemId, request.body.quantity),
  );

  app.delete(
    '/cart/items/:itemId',
    {
      preHandler: writeLimit,
      schema: {
        tags: ['cart'],
        summary: 'Remove from bag',
        params: itemParams,
        response: { 200: cartSchema, ...errors },
      },
    },
    async (request) => service.removeItem(await request.owner(), request.params.itemId),
  );

  app.put(
    '/cart/coupon',
    {
      preHandler: rateLimit(limiter, rateLimits.coupon),
      schema: {
        tags: ['cart'],
        summary: 'Apply a coupon',
        description:
          'Validates the code against the bag (dates, usage limits, minimum spend). First-order and per-customer limits are checked again at checkout, once the email is known.',
        body: applyCouponSchema,
        response: { 200: cartSchema, ...errors },
      },
    },
    async (request) => service.applyCoupon(await request.owner(), request.body.code),
  );

  app.delete(
    '/cart/coupon',
    {
      schema: { tags: ['cart'], summary: 'Remove the coupon', response: { 200: cartSchema } },
    },
    async (request) => service.removeCoupon(await request.owner()),
  );

  return Promise.resolve();
};
