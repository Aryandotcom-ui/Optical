import { apiErrorSchema } from '@optical/shared/api';
import {
  mockSimulationSchema,
  ORDER_TOKEN_HEADER,
  orderViewSchema,
  paymentProviderSchema,
} from '@optical/shared/checkout';
import type { FastifyPluginAsyncZod, ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { PaymentGateway } from './payment-gateway';

export const paymentRoutes: FastifyPluginAsyncZod<{ gateway: PaymentGateway }> = (
  app,
  { gateway },
) => {
  app.post(
    '/payments/mock/simulate',
    {
      schema: {
        tags: ['payments'],
        summary: 'Simulate a payment (mock provider)',
        description:
          'Local development only. Decides how a mock payment ends; the result arrives as a signed webhook from the background worker, like a real provider. `pending` settles as a success after MOCK_PENDING_SETTLE_SECONDS.',
        headers: z.object({ [ORDER_TOKEN_HEADER]: z.string().max(100).optional() }),
        body: mockSimulationSchema,
        response: {
          200: orderViewSchema,
          404: apiErrorSchema,
          409: apiErrorSchema,
          503: apiErrorSchema,
        },
      },
    },
    (request) =>
      gateway.simulate(
        request.body.paymentId,
        request.body.outcome,
        request.headers[ORDER_TOKEN_HEADER],
      ),
  );

  // Webhooks are verified against the exact bytes received, so this scope keeps the raw body.
  void app.register((scope, _options, done) => {
    scope.removeContentTypeParser('application/json');
    scope.addContentTypeParser(
      'application/json',
      { parseAs: 'buffer', bodyLimit: 262_144 },
      (_request, body, next) => {
        next(null, body);
      },
    );
    scope.withTypeProvider<ZodTypeProvider>().post(
      '/webhooks/:provider',
      {
        schema: {
          tags: ['payments'],
          summary: 'Payment provider webhook',
          description:
            'Signed by the provider (mock: HMAC of `timestamp.body` in x-mock-signature; Razorpay: x-razorpay-signature; Stripe: stripe-signature). Events are applied once: a repeated event id is acknowledged and ignored.',
          params: z.object({ provider: paymentProviderSchema }),
          response: {
            200: z.object({ received: z.number().int(), duplicates: z.number().int() }),
            401: apiErrorSchema,
            404: apiErrorSchema,
          },
        },
      },
      (request) =>
        gateway.handleWebhook(request.params.provider, request.body as Buffer, request.headers),
    );
    done();
  });

  return Promise.resolve();
};
