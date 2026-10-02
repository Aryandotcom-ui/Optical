import {
  ProviderError,
  type CreatedIntent,
  type IntentInput,
  type PaymentProvider,
} from './provider';

/**
 * Cash on delivery: nothing to pay online. The courier collects the cash;
 * the payment is marked succeeded when the order is delivered (Phase 6
 * admin), and refunds go to a UPI ID or bank account by hand.
 */
export class CodProvider implements PaymentProvider {
  readonly code = 'cod' as const;

  createIntent(input: IntentInput): Promise<CreatedIntent> {
    return Promise.resolve({ providerRef: `cod_${input.paymentId}`, action: { kind: 'none' } });
  }

  verifyWebhook(): never {
    throw new ProviderError('Cash on delivery has no webhooks.');
  }

  fetchStatus(): Promise<null> {
    return Promise.resolve(null);
  }

  refund(): never {
    throw new ProviderError(
      'Cash-on-delivery refunds are paid out by hand to a UPI ID or bank account.',
    );
  }
}
