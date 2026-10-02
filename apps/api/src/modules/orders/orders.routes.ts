import { apiErrorSchema } from '@optical/shared/api';
import {
  attachPrescriptionSchema,
  ORDER_TOKEN_HEADER,
  orderNumberSchema,
  orderViewSchema,
  placedOrderSchema,
  retryPaymentSchema,
  trackOrderSchema,
} from '@optical/shared/checkout';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { rateLimit, rateLimits, type RateLimiter } from '../../lib/rate-limit';
import type { PaymentGateway } from '../payments/payment-gateway';
import type { OrdersService } from './orders.service';

const params = z.object({ number: orderNumberSchema });
const tokenHeaders = z.object({ [ORDER_TOKEN_HEADER]: z.string().max(100).optional() });
const errors = { 404: apiErrorSchema, 409: apiErrorSchema, 422: apiErrorSchema };

export const orderRoutes: FastifyPluginAsyncZod<{
  service: OrdersService;
  gateway: PaymentGateway;
  limiter: RateLimiter;
}> = (app, { service, gateway, limiter }) => {
  app.addHook('onSend', (_request, reply, payload, done) => {
    void reply.header('cache-control', 'no-store');
    done(null, payload);
  });

  app.get(
    '/orders/:number',
    {
      schema: {
        tags: ['orders'],
        summary: 'An order',
        description: `Needs the order's access token in the \`${ORDER_TOKEN_HEADER}\` header (from the confirmation page or email link).`,
        params,
        headers: tokenHeaders,
        response: { 200: orderViewSchema, ...errors },
      },
    },
    (request) => service.view(request.params.number, request.headers[ORDER_TOKEN_HEADER]),
  );

  app.post(
    '/orders/track',
    {
      preHandler: rateLimit(limiter, rateLimits.track),
      schema: {
        tags: ['orders'],
        summary: 'Track an order',
        description:
          'Guest tracking by order number and the email used to order. Returns the order and its access token.',
        body: trackOrderSchema,
        response: {
          200: z.object({ order: orderViewSchema, accessToken: z.string() }),
          429: apiErrorSchema,
          ...errors,
        },
      },
    },
    (request) => service.track(request.body.number, request.body.email),
  );

  app.post(
    '/orders/:number/payment',
    {
      preHandler: rateLimit(limiter, rateLimits.paymentRetry),
      schema: {
        tags: ['orders'],
        summary: 'Try paying again',
        description:
          'After a failed or abandoned payment. Holds the stock again if the earlier hold has expired.',
        params,
        headers: tokenHeaders,
        body: retryPaymentSchema,
        response: { 200: placedOrderSchema, ...errors },
      },
    },
    (request) =>
      gateway.retry(
        request.params.number,
        request.headers[ORDER_TOKEN_HEADER],
        request.body.provider,
      ),
  );

  app.post(
    '/orders/:number/prescriptions',
    {
      schema: {
        tags: ['orders'],
        summary: 'Add a prescription to an order',
        description:
          'For lens items ordered with "send it later": typed values (validated like checkout) or an upload made from the same browser.',
        params,
        headers: tokenHeaders,
        body: attachPrescriptionSchema,
        response: { 200: orderViewSchema, ...errors },
      },
    },
    (request) =>
      service.attachPrescription(
        request.params.number,
        request.headers[ORDER_TOKEN_HEADER],
        request.sessionHash,
        request.body,
      ),
  );

  return Promise.resolve();
};
