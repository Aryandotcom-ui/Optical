import { z } from 'zod';

/** Payment providers as the API names them. Each registers only when configured. */
export const paymentProviders = ['mock', 'razorpay', 'stripe', 'cod'] as const;
export const paymentProviderSchema = z.enum(paymentProviders);
export type PaymentProviderCode = z.infer<typeof paymentProviderSchema>;

/** What the browser does next to pay. */
export const paymentActionSchema = z
  .discriminatedUnion('kind', [
    /** Local simulator: the checkout shows success, failure and pending buttons. */
    z.object({ kind: z.literal('mock'), paymentId: z.uuid() }),
    /** Hosted payment page (Razorpay, Stripe): the browser goes to `url` and comes back. */
    z.object({ kind: z.literal('redirect'), url: z.url() }),
    /** Nothing to pay now (cash on delivery). */
    z.object({ kind: z.literal('none') }),
  ])
  .meta({ id: 'PaymentAction' });
export type PaymentAction = z.infer<typeof paymentActionSchema>;

export const mockOutcomes = ['success', 'failure', 'pending'] as const;
export const mockSimulationSchema = z.object({
  paymentId: z.uuid(),
  outcome: z.enum(mockOutcomes),
});
export type MockOutcome = (typeof mockOutcomes)[number];

export const paymentOptionSchema = z.object({
  provider: paymentProviderSchema,
  available: z.boolean(),
  /** Why it can't be used for this order, in plain language. */
  reason: z.string().nullable(),
  /** Extra charge for choosing it (the cash-on-delivery fee). */
  feeMinor: z.number().int(),
});
export type PaymentOption = z.infer<typeof paymentOptionSchema>;
