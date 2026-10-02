import {
  cancelRequestSchema,
  reorderResultSchema,
  returnRequestSchema,
} from '@optical/shared/account';
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
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AppError } from '../../lib/app-error';
import { rateLimit, rateLimits, type RateLimiter } from '../../lib/rate-limit';
import type { PaymentGateway } from '../payments/payment-gateway';
import { invoiceFileName, renderInvoice } from './invoice';
import { hasInvoice } from './orders.mapper';
import type { OrderActions, OrderAccess } from './order-actions';
import type { OrdersService } from './orders.service';

const params = z.object({ number: orderNumberSchema });
const tokenHeaders = z.object({ [ORDER_TOKEN_HEADER]: z.string().max(100).optional() });
const errors = {
  401: apiErrorSchema,
  404: apiErrorSchema,
  409: apiErrorSchema,
  422: apiErrorSchema,
};
const accessNote = `The order's owner when signed in, or anyone with its access token in the \`${ORDER_TOKEN_HEADER}\` header.`;

async function accessOf(request: FastifyRequest): Promise<OrderAccess> {
  const params = request.params as { number: string };
  const token = request.headers[ORDER_TOKEN_HEADER];
  const owner = await request.owner();
  return {
    number: params.number,
    token: typeof token === 'string' ? token : undefined,
    userId: owner.userId,
  };
}

export const orderRoutes: FastifyPluginAsyncZod<{
  service: OrdersService;
  actions: OrderActions;
  gateway: PaymentGateway;
  limiter: RateLimiter;
}> = (app, { service, actions, gateway, limiter }) => {
  const writeLimit = rateLimit(limiter, rateLimits.accountWrite);
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
        description: `For the account that placed it, or with the order's access token in the \`${ORDER_TOKEN_HEADER}\` header (from the confirmation page or email link).`,
        params,
        headers: tokenHeaders,
        response: { 200: orderViewSchema, ...errors },
      },
    },
    async (request) => {
      const access = await accessOf(request);
      return service.view(access.number, access.token, access.userId);
    },
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
    async (request) => {
      const access = await accessOf(request);
      return gateway.retry(access.number, access.token, request.body.provider, access.userId);
    },
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
    async (request) =>
      service.attachPrescription(
        request.params.number,
        request.headers[ORDER_TOKEN_HEADER],
        await request.owner(),
        request.body,
      ),
  );

  app.post(
    '/orders/:number/cancel',
    {
      preHandler: writeLimit,
      schema: {
        tags: ['orders'],
        summary: 'Cancel an order',
        description: `Before anything is made or shipped (awaiting payment, paid, or awaiting the prescription). Releases the stock and any coupon use, and refunds an online payment. ${accessNote}`,
        params,
        headers: tokenHeaders,
        body: cancelRequestSchema,
        response: { 200: orderViewSchema, ...errors },
      },
    },
    async (request) => actions.cancel(await accessOf(request), request.body.note),
  );

  app.post(
    '/orders/:number/return',
    {
      preHandler: writeLimit,
      schema: {
        tags: ['orders'],
        summary: 'Ask to return an order',
        description: `Within the return window after delivery. ${accessNote}`,
        params,
        headers: tokenHeaders,
        body: returnRequestSchema,
        response: { 200: orderViewSchema, ...errors },
      },
    },
    async (request) => actions.requestReturn(await accessOf(request), request.body),
  );

  app.post(
    '/orders/:number/reorder',
    {
      preHandler: writeLimit,
      schema: {
        tags: ['orders'],
        summary: 'Buy again',
        description: `Adds the order's items to the bag at today's prices. Items that can't be added (sold out, discontinued) are listed with the reason. ${accessNote}`,
        params,
        headers: tokenHeaders,
        response: { 200: reorderResultSchema, ...errors },
      },
    },
    async (request, reply) => {
      const access = await accessOf(request);
      return actions.reorder(access, await reply.ensureOwner());
    },
  );

  app.get(
    '/orders/:number/invoice',
    {
      schema: {
        tags: ['orders'],
        summary: 'Invoice (PDF)',
        description: `Available once the order is paid (cash on delivery: once shipped). ${accessNote}`,
        params,
        headers: tokenHeaders,
        produces: ['application/pdf'],
        response: { 200: z.any().meta({ description: 'A PDF file.' }), ...errors },
      },
    },
    async (request, reply) => {
      const access = await accessOf(request);
      const order = await gateway.authorisedOrder(access.number, access.token, access.userId);
      if (!hasInvoice(order))
        throw new AppError('CONFLICT', 'The invoice is ready once the order is paid.');
      const pdf = await renderInvoice(order);
      return reply
        .type('application/pdf')
        .header('content-disposition', `attachment; filename="${invoiceFileName(order)}"`)
        .send(pdf);
    },
  );

  return Promise.resolve();
};
