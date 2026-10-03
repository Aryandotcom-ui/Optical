import { describe, expect, it, vi } from 'vitest';
import { renderEmail } from '../src/emails/render';
import type { OrderEmailData } from '../src/emails/order-email';
import { runMockWebhook, type JobContext } from '../src/jobs/handlers';
import { MemoryRateLimiter, RedisRateLimiter } from '../src/lib/rate-limit';
import { safeEqual, signPayload, verifyPayloadSignature } from '../src/lib/tokens';
import { FileLinks } from '../src/infra/storage';
import { orderAccessToken, verifyOrderAccess } from '../src/modules/orders/order-access';
import { buildTestApp } from './helpers';

const emailData: OrderEmailData = {
  number: 'LO-26-001234',
  customerName: 'Asha',
  orderUrl: 'http://localhost:3000/order/LO-26-001234?token=abc',
  paymentProvider: 'cod',
  awaitingPrescription: true,
  items: [
    {
      name: 'Harbour',
      colour: 'Jet Black',
      quantity: 1,
      totalMinor: 3_690_00,
      lens: ['Single vision', '1.61 Thin'],
    },
  ],
  totals: {
    subtotalMinor: 3_690_00,
    discountMinor: 0,
    shippingMinor: 0,
    codFeeMinor: 49_00,
    taxMinor: 400_59,
    totalMinor: 3_739_00,
    taxName: 'GST',
  },
  delivery: { earliest: '2026-10-08', latest: '2026-10-10' },
  address: ['14, 2nd Cross', 'Bengaluru', 'Karnataka 560038'],
};

describe('emails', () => {
  it('renders the confirmation with a plain-text version', async () => {
    const email = await renderEmail({ template: 'order-confirmed', data: emailData });
    expect(email.subject).toBe('Order LO-26-001234 confirmed');
    expect(email.html).toContain('href="http://localhost:3000/order/LO-26-001234?token=abc"');
    expect(email.text).toContain('You pay in cash when it arrives');
    expect(email.text).toContain('We still need your prescription');
    expect(email.text).toContain('Thu, 8 Oct – Sat, 10 Oct');
    expect(email.text).toContain('₹3,739');
  });

  it('renders the payment failure email', async () => {
    const email = await renderEmail({
      template: 'payment-failed',
      data: emailData,
      reason: 'Insufficient funds',
    });
    expect(email.subject).toBe('Payment for order LO-26-001234 did not go through');
    expect(email.text).toContain('Insufficient funds');
  });
});

describe('signatures and tokens', () => {
  it('verifies a signed payload and rejects tampering and old timestamps', () => {
    const now = 1_800_000_000;
    const signature = signPayload('secret', now, '{"a":1}');
    expect(verifyPayloadSignature('secret', now, '{"a":1}', signature, { now })).toBe('valid');
    expect(verifyPayloadSignature('secret', now, '{"a":2}', signature, { now })).toBe('invalid');
    expect(verifyPayloadSignature('secret', now, '{"a":1}', signature, { now: now + 301 })).toBe(
      'expired',
    );
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });

  it('derives order access tokens from the secret', () => {
    const token = orderAccessToken('secret-one', 'order-1');
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(verifyOrderAccess('secret-one', 'order-1', token)).toBe(true);
    expect(verifyOrderAccess('secret-two', 'order-1', token)).toBe(false);
    expect(verifyOrderAccess('secret-one', 'order-2', token)).toBe(false);
  });

  it('signs file links that expire', () => {
    const links = new FileLinks('secret', 'http://api');
    const url = new URL(links.url('rx/0192f1e0-0000-7000-8000-000000000001.jpg', 60, 1_000_000));
    const expires = Number(url.searchParams.get('expires'));
    const signature = url.searchParams.get('signature') ?? '';
    expect(
      links.verify('rx/0192f1e0-0000-7000-8000-000000000001.jpg', expires, signature, 1_000_000),
    ).toBe(true);
    expect(
      links.verify(
        'rx/0192f1e0-0000-7000-8000-000000000001.jpg',
        expires,
        signature,
        1_000_000 + 61_000,
      ),
    ).toBe(false);
    expect(
      links.verify('rx/0192f1e0-0000-7000-8000-000000000002.jpg', expires, signature, 1_000_000),
    ).toBe(false);
  });
});

describe('rate limiting', () => {
  it('counts per window', async () => {
    let now = 0;
    const limiter = new MemoryRateLimiter(() => now);
    expect(await limiter.hit('k', 60)).toBe(1);
    expect(await limiter.hit('k', 60)).toBe(2);
    now = 61_000;
    expect(await limiter.hit('k', 60)).toBe(1);
  });

  it('fails open when Redis is down', async () => {
    const warn = vi.fn();
    const broken = {
      multi: () => ({
        incr: () => ({ expire: () => ({ exec: () => Promise.reject(new Error('down')) }) }),
      }),
    };
    const limiter = new RedisRateLimiter(broken as never, { warn });
    expect(await limiter.hit('k', 60)).toBe(0);
    expect(warn).toHaveBeenCalledOnce();
  });

  it('answers 429 with Retry-After once the limit is passed', async () => {
    const { app } = await buildTestApp();
    let last;
    for (let attempt = 0; attempt < 11; attempt += 1)
      last = await app.inject({
        method: 'POST',
        url: '/v1/orders/track',
        payload: { number: 'LO-26-000001', email: 'a@example.com' },
      });
    expect(last?.statusCode).toBe(429);
    expect(last?.headers['retry-after']).toBe('60');
    await app.close();
  });
});

describe('session cookie', () => {
  it('is Secure in production', async () => {
    const { app } = await buildTestApp({ env: { NODE_ENV: 'production' } });
    app.post('/test-session', (_request, reply) => {
      reply.ensureSession();
      return { ok: true };
    });
    const response = await app.inject({ method: 'POST', url: '/test-session', payload: {} });
    expect(response.cookies[0]).toMatchObject({ name: 'lo_session', secure: true, httpOnly: true });
    await app.close();
  });
});

describe('mock webhook job', () => {
  it('posts a signed webhook and throws on refusal so the queue retries', async () => {
    const fetch = vi.fn(() => Promise.resolve(new Response('{}', { status: 200 })));
    const context = {
      secret: 's'.repeat(32),
      apiUrl: 'http://api',
      fetch,
    } as unknown as JobContext;
    await runMockWebhook(context, { eventId: 'e', paymentRef: 'mock_1', outcome: 'succeeded' });
    expect(fetch).toHaveBeenCalledWith(
      'http://api/v1/webhooks/mock',
      expect.objectContaining({ method: 'POST' }),
    );
    const refused = {
      ...context,
      fetch: vi.fn(() => Promise.resolve(new Response('{}', { status: 401 }))),
    };
    await expect(
      runMockWebhook(refused as unknown as JobContext, {
        eventId: 'e',
        paymentRef: 'm',
        outcome: 'failed',
      }),
    ).rejects.toThrow('401');
  });
});

describe('rate limit scale', () => {
  it('multiplies every limit for test environments', async () => {
    const { app } = await buildTestApp({ env: { RATE_LIMIT_SCALE: '2' } });
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 21; attempt += 1)
      statuses.push(
        (
          await app.inject({
            method: 'POST',
            url: '/v1/orders/track',
            payload: { number: 'LO-26-000001', email: 'a@example.com' },
          })
        ).statusCode,
      );
    expect(statuses.filter((status) => status === 429)).toEqual([429]);
    await app.close();
  });
});
