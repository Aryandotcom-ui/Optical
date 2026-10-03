import { hmacHex, safeEqual } from '../../lib/tokens';
import {
  header,
  ProviderError,
  type CreatedIntent,
  type IntentInput,
  type PaymentEvent,
  type PaymentProvider,
  type WebhookVerification,
} from './provider';

export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}

/** Razorpay closes a payment link after this long; matches our stock hold. */
const LINK_TTL_SECONDS = 20 * 60;

interface PaymentLink {
  id: string;
  short_url: string;
  status: 'created' | 'partially_paid' | 'paid' | 'expired' | 'cancelled';
  payments?: { payment_id: string }[] | null;
}

/**
 * Razorpay through hosted Payment Links: the customer pays on Razorpay's
 * page (card, UPI, netbanking, wallets) and comes back, so no third-party
 * script runs on our pages. Webhooks are verified with HMAC-SHA256 of the
 * raw body; replays are rejected by event id.
 */
export class RazorpayProvider implements PaymentProvider {
  readonly code = 'razorpay' as const;
  private readonly baseUrl: string;
  private readonly fetch: typeof fetch;

  constructor(private readonly config: RazorpayConfig) {
    this.baseUrl = config.baseUrl ?? 'https://api.razorpay.com';
    this.fetch = config.fetch ?? fetch;
  }

  private async call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const auth = Buffer.from(`${this.config.keyId}:${this.config.keySecret}`).toString('base64');
    const response = await this.fetch(`${this.baseUrl}${path}`, {
      method,
      headers: { authorization: `Basic ${auth}`, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok)
      throw new ProviderError(`Razorpay ${method} ${path} failed with ${response.status}`);
    return (await response.json()) as T;
  }

  async createIntent(input: IntentInput): Promise<CreatedIntent> {
    const link = await this.call<PaymentLink>('POST', '/v1/payment_links', {
      amount: input.amountMinor,
      currency: input.currency,
      reference_id: input.paymentId,
      description: `Order ${input.orderNumber}`,
      customer: {
        name: input.customer.name,
        email: input.customer.email,
        contact: input.customer.phone,
      },
      notify: { sms: false, email: false },
      reminder_enable: false,
      callback_url: input.returnUrl,
      callback_method: 'get',
      expire_by: Math.floor(Date.now() / 1000) + LINK_TTL_SECONDS,
    });
    return { providerRef: link.id, action: { kind: 'redirect', url: link.short_url } };
  }

  verifyWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): WebhookVerification {
    const signature = header(headers, 'x-razorpay-signature');
    if (!signature || !safeEqual(hmacHex(this.config.webhookSecret, rawBody), signature))
      return { ok: false, reason: 'bad-signature' };
    try {
      const body = JSON.parse(rawBody.toString('utf8')) as {
        event: string;
        payload: {
          payment_link?: { entity: { id: string } };
          payment?: { entity: { method?: string } };
        };
      };
      const eventId = header(headers, 'x-razorpay-event-id') ?? '';
      const linkId = body.payload.payment_link?.entity.id;
      const outcome: Partial<Record<string, PaymentEvent['outcome']>> = {
        'payment_link.paid': 'succeeded',
        'payment_link.expired': 'failed',
        'payment_link.cancelled': 'failed',
      };
      const mapped = outcome[body.event];
      if (!eventId || !linkId || !mapped) return { ok: true, events: [] };
      return {
        ok: true,
        events: [
          {
            eventId,
            providerRef: linkId,
            outcome: mapped,
            method: body.payload.payment?.entity.method ?? null,
            failureReason:
              mapped === 'failed' ? 'The payment link expired before it was paid.' : null,
          },
        ],
      };
    } catch {
      return { ok: false, reason: 'unreadable' };
    }
  }

  async fetchStatus(providerRef: string): Promise<PaymentEvent | null> {
    const link = await this.call<PaymentLink>(
      'GET',
      `/v1/payment_links/${encodeURIComponent(providerRef)}`,
    );
    const outcome: PaymentEvent['outcome'] =
      link.status === 'paid'
        ? 'succeeded'
        : link.status === 'expired' || link.status === 'cancelled'
          ? 'failed'
          : 'pending';
    return { eventId: `reconcile_${link.id}_${link.status}`, providerRef: link.id, outcome };
  }

  async refund(providerRef: string, amountMinor: number): Promise<{ refundRef: string }> {
    const link = await this.call<PaymentLink>(
      'GET',
      `/v1/payment_links/${encodeURIComponent(providerRef)}`,
    );
    const paymentId = link.payments?.[0]?.payment_id;
    if (!paymentId) throw new ProviderError('This payment link has no captured payment to refund.');
    const refund = await this.call<{ id: string }>(
      'POST',
      `/v1/payments/${encodeURIComponent(paymentId)}/refund`,
      { amount: amountMinor },
    );
    return { refundRef: refund.id };
  }
}
