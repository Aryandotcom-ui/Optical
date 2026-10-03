import type { Redis } from 'ioredis';
import { randomToken, signPayload, verifyPayloadSignature } from '../../lib/tokens';
import type { MockWebhookJob } from '../../infra/queue';
import {
  header,
  type CreatedIntent,
  type IntentInput,
  type PaymentEvent,
  type PaymentProvider,
  type WebhookVerification,
} from './provider';

export const MOCK_SIGNATURE_HEADER = 'x-mock-signature';

/** What the pretend bank knows about a payment. */
export interface MockBankRecord {
  outcome: PaymentEvent['outcome'];
  failureReason: string | null;
  /** For pending payments: when the bank will confirm. */
  settlesAt: number | null;
}

/** Where the mock provider keeps its pretend bank's state. */
export interface MockBank {
  get(ref: string): Promise<MockBankRecord | null>;
  set(ref: string, record: MockBankRecord): Promise<void>;
}

export class RedisMockBank implements MockBank {
  constructor(private readonly redis: Redis) {}

  async get(ref: string) {
    const raw = await this.redis.get(`mockbank:${ref}`);
    return raw ? (JSON.parse(raw) as MockBankRecord) : null;
  }

  async set(ref: string, record: MockBankRecord) {
    await this.redis.set(`mockbank:${ref}`, JSON.stringify(record), 'EX', 86_400);
  }
}

export class MemoryMockBank implements MockBank {
  readonly records = new Map<string, MockBankRecord>();

  get(ref: string) {
    return Promise.resolve(this.records.get(ref) ?? null);
  }

  set(ref: string, record: MockBankRecord) {
    this.records.set(ref, record);
    return Promise.resolve();
  }
}

/** The signed request the worker sends to `/v1/webhooks/mock`. */
export function buildMockWebhook(secret: string, job: MockWebhookJob, now = Date.now()) {
  const body = JSON.stringify({
    id: job.eventId,
    type: `payment.${job.outcome}`,
    data: { ref: job.paymentRef, failureReason: job.failureReason ?? null },
  });
  const timestamp = Math.floor(now / 1000);
  return {
    body,
    headers: {
      'content-type': 'application/json',
      [MOCK_SIGNATURE_HEADER]: `t=${timestamp},v1=${signPayload(secret, timestamp, body)}`,
    },
  };
}

/** Parses "t=123,v1=abc" signature headers (mock and Stripe use this shape). */
export function parseSignatureHeader(value: string | undefined): { t: number; v1: string } | null {
  if (!value) return null;
  const parts = Object.fromEntries(
    value.split(',').map((part) => {
      const [key = '', ...rest] = part.trim().split('=');
      return [key, rest.join('=')];
    }),
  );
  const t = Number(parts.t);
  return Number.isSafeInteger(t) && parts.v1 ? { t, v1: parts.v1 } : null;
}

const outcomes = new Set(['succeeded', 'failed', 'pending']);

/**
 * A fully working local payment provider. The checkout shows buttons to
 * succeed, fail or leave a payment pending; the outcome arrives the way a
 * real one does, as a signed webhook delivered by the background worker.
 */
export class MockProvider implements PaymentProvider {
  readonly code = 'mock' as const;

  constructor(
    private readonly secret: string,
    readonly bank: MockBank,
  ) {}

  createIntent(input: IntentInput): Promise<CreatedIntent> {
    return Promise.resolve({
      providerRef: `mock_${input.paymentId}`,
      action: { kind: 'mock', paymentId: input.paymentId },
    });
  }

  verifyWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): WebhookVerification {
    const signature = parseSignatureHeader(header(headers, MOCK_SIGNATURE_HEADER));
    if (!signature) return { ok: false, reason: 'bad-signature' };
    const body = rawBody.toString('utf8');
    const check = verifyPayloadSignature(this.secret, signature.t, body, signature.v1);
    if (check !== 'valid')
      return { ok: false, reason: check === 'expired' ? 'expired' : 'bad-signature' };
    try {
      const event = JSON.parse(body) as {
        id: string;
        type: string;
        data: { ref: string; failureReason: string | null };
      };
      const outcome = event.type.replace(/^payment\./, '');
      if (!outcomes.has(outcome) || typeof event.id !== 'string')
        return { ok: false, reason: 'unreadable' };
      return {
        ok: true,
        events: [
          {
            eventId: event.id,
            providerRef: event.data.ref,
            outcome: outcome as PaymentEvent['outcome'],
            method: 'mock',
            failureReason: event.data.failureReason,
          },
        ],
      };
    } catch {
      return { ok: false, reason: 'unreadable' };
    }
  }

  async fetchStatus(providerRef: string): Promise<PaymentEvent | null> {
    const record = await this.bank.get(providerRef);
    if (!record) return null;
    const settled =
      record.outcome === 'pending' && record.settlesAt !== null && record.settlesAt <= Date.now();
    return {
      eventId: `reconcile_${providerRef}_${settled ? 'succeeded' : record.outcome}`,
      providerRef,
      outcome: settled ? 'succeeded' : record.outcome,
      method: 'mock',
      failureReason: record.failureReason,
    };
  }

  refund(): Promise<{ refundRef: string }> {
    return Promise.resolve({ refundRef: `mock_refund_${randomToken(9)}` });
  }
}
