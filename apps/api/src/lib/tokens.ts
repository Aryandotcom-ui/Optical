import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** 256 random bits, URL-safe. Used for session, order-access and upload tokens. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Tokens are stored only as their SHA-256, so a database leak can't be replayed. */
export function sha256Hex(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export function hmacHex(secret: string, value: string | Buffer): string {
  return createHmac('sha256', secret).update(value).digest('hex');
}

/** Compares two strings in constant time (for signatures and token hashes). */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Signs a webhook-style payload: HMAC-SHA256 over `${timestamp}.${body}`.
 * Including the timestamp lets the receiver reject replays of old messages.
 */
export function signPayload(secret: string, timestamp: number, body: string): string {
  return hmacHex(secret, `${timestamp}.${body}`);
}

export type SignatureCheck = 'valid' | 'invalid' | 'expired';

export function verifyPayloadSignature(
  secret: string,
  timestamp: number,
  body: string,
  signature: string,
  options: { now?: number; toleranceSeconds?: number } = {},
): SignatureCheck {
  const now = options.now ?? Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(timestamp)) return 'invalid';
  if (!safeEqual(signPayload(secret, timestamp, body), signature)) return 'invalid';
  if (Math.abs(now - timestamp) > (options.toleranceSeconds ?? 300)) return 'expired';
  return 'valid';
}
