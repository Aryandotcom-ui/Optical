import type { Wishlist } from '@optical/shared/account';
import { call } from './bag-api';

/** Saves one wishlist change to the account (signed-in customers only). */
export function syncWishlistChange(productId: string, added: boolean): Promise<Wishlist> {
  return call<Wishlist>(added ? 'PUT' : 'DELETE', `/v1/account/wishlist/items/${productId}`);
}
