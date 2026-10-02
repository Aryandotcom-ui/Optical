import { verifyPayloadSignature } from '../../lib/tokens';
import { parseSignatureHeader } from './mock';
import {
  header,
  ProviderError,
  type CreatedIntent,
  type IntentInput,
  type PaymentEvent,
  type PaymentProvider,
  type WebhookVerification,
} from './provider';

export interface StripeConfig {
  secretKey: string;
  webhookSecret: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}

/** Stripe's minimum lifetime for a Checkout Session. */
const SESSION_TTL_SECONDS = 30 * 60;

interface CheckoutSession {
  id: string;
  url: string | null;
  status: 'open' | 'complete' | 'expired';
  payment_status: 'paid' | 'unpaid' | 'no_payment_required';
  payment_intent: string | null;
}

/** Flattens nested params into Stripe's form encoding: a[b][0][c]=value. */
export function formEncode(params: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(params).flatMap(([key, value]) => {
    const name = prefix ? `${prefix}[${key}]` : key;
    if (value === undefined || value === null) return [];
    if (typeof value === 'object') return formEncode(value as Record<string, unknown>, name);
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    return [`${encodeURIComponent(name)}=${encodeURIComponent(text)}`];
  });
}

/**
 * Stripe through hosted Checkout: the customer pays on Stripe's page and
 * comes back, so card details never touch our pages and no Stripe script
 * runs on them. Webhooks are verified per Stripe's scheme (HMAC of
 * `timestamp.body`, five-minute tolerance) and deduplicated by event id.
 */
export class StripeProvider implements PaymentProvider {
  readonly code = 'stripe' as const;
  private readonly baseUrl: string;
  private readonly fetch: typeof fetch;

  constructor(private readonly config: StripeConfig) {
    this.baseUrl = config.baseUrl ?? 'https://api.stripe.com';
    this.fetch = config.fetch ?? fetch;
  }

  private async call<T>(
    method: 'GET' | 'POST',
    path: string,
    params?: Record<string, unknown>,
  ): Promise<T> {
    const response = await this.fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.config.secretKey}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      ...(params ? { body: formEncode(params).join('&') } : {}),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok)
      throw new ProviderError(`Stripe ${method} ${path} failed with ${response.status}`);
    return (await response.json()) as T;
  }

  async createIntent(input: IntentInput): Promise<CreatedIntent> {
    const session = await this.call<CheckoutSession>('POST', '/v1/checkout/sessions', {
      mode: 'payment',
      success_url: input.returnUrl,
      cancel_url: input.returnUrl,
      client_reference_id: input.paymentId,
      customer_email: input.customer.email,
      expires_at: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
      metadata: { paymentId: input.paymentId, orderNumber: input.orderNumber },
      line_items: {
        0: {
          quantity: 1,
          price_data: {
            currency: input.currency.toLowerCase(),
            unit_amount: input.amountMinor,
            product_data: { name: `Order ${input.orderNumber}` },
          },
        },
      },
    });
    if (!session.url) throw new ProviderError('Stripe did not return a checkout page.');
    return { providerRef: session.id, action: { kind: 'redirect', url: session.url } };
  }

  verifyWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): WebhookVerification {
    const signature = parseSignatureHeader(header(headers, 'stripe-signature'));
    if (!signature) return { ok: false, reason: 'bad-signature' };
    const body = rawBody.toString('utf8');
    const check = verifyPayloadSignature(
      this.config.webhookSecret,
      signature.t,
      body,
      signature.v1,
    );
    if (check !== 'valid')
      return { ok: false, reason: check === 'expired' ? 'expired' : 'bad-signature' };
    try {
      const event = JSON.parse(body) as {
        id: string;
        type: string;
        data: { object: CheckoutSession };
      };
      const session = event.data.object;
      const outcomes: Partial<Record<string, PaymentEvent['outcome']>> = {
        'checkout.session.completed': session.payment_status === 'paid' ? 'succeeded' : 'pending',
        'checkout.session.async_payment_succeeded': 'succeeded',
        'checkout.session.async_payment_failed': 'failed',
        'checkout.session.expired': 'failed',
      };
      const outcome = outcomes[event.type];
      if (!outcome) return { ok: true, events: [] };
      return {
        ok: true,
        events: [
          {
            eventId: event.id,
            providerRef: session.id,
            outcome,
            failureReason:
              event.type === 'checkout.session.expired'
                ? 'The payment page expired before it was paid.'
                : outcome === 'failed'
                  ? 'The bank declined the payment.'
                  : null,
          },
        ],
      };
    } catch {
      return { ok: false, reason: 'unreadable' };
    }
  }

  async fetchStatus(providerRef: string): Promise<PaymentEvent | null> {
    const session = await this.call<CheckoutSession>(
      'GET',
      `/v1/checkout/sessions/${encodeURIComponent(providerRef)}`,
    );
    const outcome: PaymentEvent['outcome'] =
      session.payment_status === 'paid'
        ? 'succeeded'
        : session.status === 'expired'
          ? 'failed'
          : 'pending';
    return { eventId: `reconcile_${session.id}_${outcome}`, providerRef: session.id, outcome };
  }

  async refund(providerRef: string, amountMinor: number): Promise<{ refundRef: string }> {
    const session = await this.call<CheckoutSession>(
      'GET',
      `/v1/checkout/sessions/${encodeURIComponent(providerRef)}`,
    );
    if (!session.payment_intent) throw new ProviderError('This session has no payment to refund.');
    const refund = await this.call<{ id: string }>('POST', '/v1/refunds', {
      payment_intent: session.payment_intent,
      amount: amountMinor,
    });
    return { refundRef: refund.id };
  }
}
