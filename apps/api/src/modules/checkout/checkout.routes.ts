import { apiErrorSchema } from '@optical/shared/api';
import {
  checkoutQuoteRequestSchema,
  checkoutQuoteSchema,
  placedOrderSchema,
  placeOrderSchema,
} from '@optical/shared/checkout';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { rateLimit, rateLimits, type RateLimiter } from '../../lib/rate-limit';
import type { CheckoutService } from './checkout.service';

export const checkoutRoutes: FastifyPluginAsyncZod<{
  service: CheckoutService;
  limiter: RateLimiter;
}> = (app, { service, limiter }) => {
  app.addHook('onSend', (_request, reply, payload, done) => {
    void reply.header('cache-control', 'no-store');
    done(null, payload);
  });

  app.post(
    '/checkout/quote',
    {
      schema: {
        tags: ['checkout'],
        summary: 'Price the bag for delivery',
        description:
          'Prices the bag for a delivery speed, postal code and payment method, with delivery dates and which payment methods are available.',
        body: checkoutQuoteRequestSchema,
        response: { 200: checkoutQuoteSchema, 409: apiErrorSchema, 422: apiErrorSchema },
      },
    },
    (request) => service.quote(request.sessionHash, request.body),
  );

  app.post(
    '/checkout/orders',
    {
      preHandler: rateLimit(limiter, rateLimits.placeOrder),
      schema: {
        tags: ['checkout'],
        summary: 'Place an order',
        description:
          'Places an order from the bag. Requires an `Idempotency-Key` header: repeating a request returns the same order. Prices are recomputed; if the total differs from `expectedTotalMinor`, `PRICE_CHANGED` is returned and nothing is created. Stock is held for 15 minutes while payment completes.',
        headers: z.object({ 'idempotency-key': z.string().optional() }),
        body: placeOrderSchema,
        response: {
          201: placedOrderSchema,
          400: apiErrorSchema,
          409: apiErrorSchema,
          422: apiErrorSchema,
          429: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const placed = await service.placeOrder(
        request.sessionHash,
        request.headers['idempotency-key'],
        request.body,
      );
      return reply.status(201).send(placed);
    },
  );

  return Promise.resolve();
};
