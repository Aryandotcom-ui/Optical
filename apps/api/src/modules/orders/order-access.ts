import { hmacHex, safeEqual } from '../../lib/tokens';

/**
 * The token in an order's private link (confirmation page, emails). It is
 * derived from the order id with the app secret, so nothing needs storing
 * and links in old emails keep working; rotating APP_SECRET revokes them all.
 */
export function orderAccessToken(secret: string, orderId: string): string {
  return Buffer.from(hmacHex(secret, `order-access:${orderId}`), 'hex').toString('base64url');
}

export function verifyOrderAccess(secret: string, orderId: string, token: string): boolean {
  return safeEqual(orderAccessToken(secret, orderId), token);
}
