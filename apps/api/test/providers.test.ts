import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { CodProvider } from '../src/modules/payments/cod';
import {
  buildMockWebhook,
  MemoryMockBank,
  MockProvider,
  parseSignatureHeader,
} from '../src/modules/payments/mock';
import { RazorpayProvider } from '../src/modules/payments/razorpay';
import { createPaymentRegistry } from '../src/modules/payments/registry';
import { formEncode, StripeProvider } from '../src/modules/payments/stripe';
import { testEnv } from './helpers';

const intent = {
  paymentId: '01920000-0000-7000-8000-000000000001',
  orderNumber: 'LO-26-001234',
  amountMinor: 2_490_00,
  currency: 'INR',
  customer: { name: 'Asha', email: 'asha@example.com', phone: '+919800000003' },
  returnUrl: 'http://localhost:3000/order/LO-26-001234?token=t',
};

function fakeFetch(responses: unknown[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = vi.fn((url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(new Response(JSON.stringify(responses.shift()), { status: 200 }));
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls };
}

describe('MockProvider', () => {
  it('signs and verifies webhooks', () => {
    const provider = new MockProvider('s'.repeat(32), new MemoryMockBank());
    const { body, headers } = buildMockWebhook('s'.repeat(32), {
      eventId: 'evt_1',
      paymentRef: 'mock_1',
      outcome: 'failed',
      failureReason: 'Declined',
    });
    expect(provider.verifyWebhook(Buffer.from(body), headers)).toEqual({
      ok: true,
      events: [
        {
          eventId: 'evt_1',
          providerRef: 'mock_1',
          outcome: 'failed',
          method: 'mock',
          failureReason: 'Declined',
        },
      ],
    });
    expect(provider.verifyWebhook(Buffer.from(body), {})).toEqual({
      ok: false,
      reason: 'bad-signature',
    });
  });

  it('reports pending payments as settled once the bank confirms', async () => {
    const bank = new MemoryMockBank();
    const provider = new MockProvider('s'.repeat(32), bank);
    await bank.set('mock_2', {
      outcome: 'pending',
      failureReason: null,
      settlesAt: Date.now() - 1,
    });
    expect(await provider.fetchStatus('mock_2')).toMatchObject({ outcome: 'succeeded' });
    expect(await provider.fetchStatus('unknown')).toBeNull();
  });

  it('parses signature headers strictly', () => {
    expect(parseSignatureHeader('t=12,v1=ab=c')).toEqual({ t: 12, v1: 'ab=c' });
    expect(parseSignatureHeader('t=x,v1=ab')).toBeNull();
    expect(parseSignatureHeader(undefined)).toBeNull();
  });
});

describe('RazorpayProvider', () => {
  const config = { keyId: 'rzp_test_key', keySecret: 'secret', webhookSecret: 'whsec' };

  it('creates a hosted payment link', async () => {
    const { fetch, calls } = fakeFetch([
      { id: 'plink_1', short_url: 'https://rzp.io/i/abc', status: 'created' },
    ]);
    const provider = new RazorpayProvider({ ...config, fetch });
    expect(await provider.createIntent(intent)).toEqual({
      providerRef: 'plink_1',
      action: { kind: 'redirect', url: 'https://rzp.io/i/abc' },
    });
    expect(calls[0]?.url).toBe('https://api.razorpay.com/v1/payment_links');
    expect(new Headers(calls[0]?.init.headers).get('authorization')).toBe(
      `Basic ${Buffer.from('rzp_test_key:secret').toString('base64')}`,
    );
    expect(JSON.parse(calls[0]?.init.body as string)).toMatchObject({
      amount: 2_490_00,
      currency: 'INR',
      reference_id: intent.paymentId,
      callback_url: intent.returnUrl,
    });
  });

  it('verifies webhooks with an HMAC of the raw body', () => {
    const provider = new RazorpayProvider(config);
    const body = Buffer.from(
      JSON.stringify({
        event: 'payment_link.paid',
        payload: {
          payment_link: { entity: { id: 'plink_1' } },
          payment: { entity: { method: 'upi' } },
        },
      }),
    );
    const signature = createHmac('sha256', 'whsec').update(body).digest('hex');
    expect(
      provider.verifyWebhook(body, {
        'x-razorpay-signature': signature,
        'x-razorpay-event-id': 'evt_r1',
      }),
    ).toEqual({
      ok: true,
      events: [
        {
          eventId: 'evt_r1',
          providerRef: 'plink_1',
          outcome: 'succeeded',
          method: 'upi',
          failureReason: null,
        },
      ],
    });
    expect(provider.verifyWebhook(body, { 'x-razorpay-signature': 'bad' })).toEqual({
      ok: false,
      reason: 'bad-signature',
    });
  });

  it('checks status and refunds the captured payment', async () => {
    const { fetch, calls } = fakeFetch([
      { id: 'plink_1', status: 'paid', short_url: '' },
      { id: 'plink_1', status: 'paid', short_url: '', payments: [{ payment_id: 'pay_9' }] },
      { id: 'rfnd_1' },
    ]);
    const provider = new RazorpayProvider({ ...config, fetch });
    expect(await provider.fetchStatus('plink_1')).toMatchObject({ outcome: 'succeeded' });
    expect(await provider.refund('plink_1', 100_00)).toEqual({ refundRef: 'rfnd_1' });
    expect(calls[2]?.url).toBe('https://api.razorpay.com/v1/payments/pay_9/refund');
  });
});

describe('StripeProvider', () => {
  const config = { secretKey: 'sk_test_1', webhookSecret: 'whsec_test' };

  it('encodes nested form parameters', () => {
    expect(formEncode({ a: 1, b: { c: 'x y', d: { 0: 2 } }, skip: undefined })).toEqual([
      'a=1',
      'b%5Bc%5D=x%20y',
      'b%5Bd%5D%5B0%5D=2',
    ]);
  });

  it('creates a hosted Checkout session', async () => {
    const { fetch, calls } = fakeFetch([
      {
        id: 'cs_1',
        url: 'https://checkout.stripe.com/c/pay/cs_1',
        status: 'open',
        payment_status: 'unpaid',
        payment_intent: null,
      },
    ]);
    const provider = new StripeProvider({ ...config, fetch });
    expect(await provider.createIntent(intent)).toEqual({
      providerRef: 'cs_1',
      action: { kind: 'redirect', url: 'https://checkout.stripe.com/c/pay/cs_1' },
    });
    const body = decodeURIComponent(calls[0]?.init.body as string);
    expect(body).toContain('line_items[0][price_data][unit_amount]=249000');
    expect(body).toContain('line_items[0][price_data][currency]=inr');
    expect(body).toContain(`client_reference_id=${intent.paymentId}`);
  });

  it("verifies webhooks with Stripe's timestamped signature", () => {
    const provider = new StripeProvider(config);
    const body = JSON.stringify({
      id: 'evt_s1',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_1', payment_status: 'paid', status: 'complete' } },
    });
    const t = Math.floor(Date.now() / 1000);
    const v1 = createHmac('sha256', 'whsec_test').update(`${t}.${body}`).digest('hex');
    expect(
      provider.verifyWebhook(Buffer.from(body), { 'stripe-signature': `t=${t},v1=${v1}` }),
    ).toEqual({
      ok: true,
      events: [
        { eventId: 'evt_s1', providerRef: 'cs_1', outcome: 'succeeded', failureReason: null },
      ],
    });
    const old = t - 600;
    const oldSignature = createHmac('sha256', 'whsec_test').update(`${old}.${body}`).digest('hex');
    expect(
      provider.verifyWebhook(Buffer.from(body), {
        'stripe-signature': `t=${old},v1=${oldSignature}`,
      }),
    ).toEqual({
      ok: false,
      reason: 'expired',
    });
  });

  it('ignores events it does not handle', () => {
    const provider = new StripeProvider(config);
    const body = JSON.stringify({
      id: 'evt_x',
      type: 'customer.created',
      data: { object: { id: 'cus_1' } },
    });
    const t = Math.floor(Date.now() / 1000);
    const v1 = createHmac('sha256', 'whsec_test').update(`${t}.${body}`).digest('hex');
    expect(
      provider.verifyWebhook(Buffer.from(body), { 'stripe-signature': `t=${t},v1=${v1}` }),
    ).toEqual({ ok: true, events: [] });
  });
});

describe('payment registry', () => {
  it('registers only configured providers', () => {
    expect(createPaymentRegistry(testEnv(), new MemoryMockBank()).codes()).toEqual(['mock', 'cod']);
    const all = createPaymentRegistry(
      testEnv({
        RAZORPAY_KEY_ID: 'k',
        RAZORPAY_KEY_SECRET: 's',
        RAZORPAY_WEBHOOK_SECRET: 'w',
        STRIPE_SECRET_KEY: 'sk',
        STRIPE_WEBHOOK_SECRET: 'wh',
        FEATURE_FLAGS: 'cashOnDelivery=off',
        MOCK_PAYMENTS_ENABLED: 'off',
      }),
      new MemoryMockBank(),
    );
    expect(all.codes()).toEqual(['razorpay', 'stripe']);
  });

  it('cash on delivery has nothing to pay online', async () => {
    const cod = new CodProvider();
    expect(await cod.createIntent(intent)).toEqual({
      providerRef: `cod_${intent.paymentId}`,
      action: { kind: 'none' },
    });
    expect(await cod.fetchStatus()).toBeNull();
    expect(() => cod.refund()).toThrow(/by hand/);
  });
});
