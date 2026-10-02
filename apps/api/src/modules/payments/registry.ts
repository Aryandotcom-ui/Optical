import type { PaymentProviderCode } from '@optical/shared/checkout';
import type { ApiEnv } from '../../config/env';
import { CodProvider } from './cod';
import { MockProvider, type MockBank } from './mock';
import type { PaymentProvider } from './provider';
import { RazorpayProvider } from './razorpay';
import { StripeProvider } from './stripe';

/** The providers available in this deployment, in the order checkout offers them. */
export class PaymentRegistry {
  private readonly providers = new Map<PaymentProviderCode, PaymentProvider>();

  constructor(providers: PaymentProvider[]) {
    for (const provider of providers) this.providers.set(provider.code, provider);
  }

  get(code: PaymentProviderCode): PaymentProvider | undefined {
    return this.providers.get(code);
  }

  codes(): PaymentProviderCode[] {
    return [...this.providers.keys()];
  }
}

/**
 * Providers register only when configured: Razorpay and Stripe need their
 * keys, the mock is on outside production, and cash on delivery follows its
 * feature flag and market settings.
 */
export function createPaymentRegistry(env: ApiEnv, mockBank: MockBank): PaymentRegistry {
  const providers: PaymentProvider[] = [];
  if (env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET && env.RAZORPAY_WEBHOOK_SECRET)
    providers.push(
      new RazorpayProvider({
        keyId: env.RAZORPAY_KEY_ID,
        keySecret: env.RAZORPAY_KEY_SECRET,
        webhookSecret: env.RAZORPAY_WEBHOOK_SECRET,
      }),
    );
  if (env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET)
    providers.push(
      new StripeProvider({
        secretKey: env.STRIPE_SECRET_KEY,
        webhookSecret: env.STRIPE_WEBHOOK_SECRET,
      }),
    );
  if (env.MOCK_PAYMENTS_ENABLED) providers.push(new MockProvider(env.APP_SECRET, mockBank));
  if (env.featureFlags.cashOnDelivery) providers.push(new CodProvider());
  return new PaymentRegistry(providers);
}
