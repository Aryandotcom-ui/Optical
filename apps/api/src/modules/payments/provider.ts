import type { PaymentAction, PaymentProviderCode } from '@optical/shared/checkout';

export interface IntentInput {
  /** Our Payment row id; providers echo it back as a reference. */
  paymentId: string;
  orderNumber: string;
  amountMinor: number;
  currency: string;
  customer: { name: string; email: string; phone: string };
  /** Where a hosted payment page sends the customer afterwards. */
  returnUrl: string;
}

export interface CreatedIntent {
  /** The provider's id for this payment, used to match webhooks. */
  providerRef: string;
  action: PaymentAction;
}

/** A payment outcome, as reported by a webhook or a status check. */
export interface PaymentEvent {
  /** Unique per event, for replay protection. */
  eventId: string;
  providerRef: string;
  outcome: 'succeeded' | 'failed' | 'pending';
  method?: string | null;
  failureReason?: string | null;
}

export type WebhookVerification =
  | { ok: true; events: PaymentEvent[] }
  | { ok: false; reason: 'bad-signature' | 'expired' | 'unreadable' };

/**
 * The contract every payment provider implements. Providers register only
 * when configured, and the API trusts a payment only after a verified
 * webhook or a status check with the provider, never the browser.
 */
export interface PaymentProvider {
  readonly code: PaymentProviderCode;
  createIntent(input: IntentInput): Promise<CreatedIntent>;
  verifyWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): WebhookVerification;
  /** Current state at the provider, for reconciliation; null when unknown. */
  fetchStatus(providerRef: string): Promise<PaymentEvent | null>;
  refund(providerRef: string, amountMinor: number): Promise<{ refundRef: string }>;
}

export class ProviderError extends Error {
  override name = 'ProviderError';
}

export function header(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}
