import { MAX_ITEM_QUANTITY } from '@optical/shared/pricing';
import type { Prisma } from '../../generated/prisma/client';
import { MAX_CART_LINES } from '../cart/cart.service';

type Tx = Prisma.TransactionClient;

const sameLine = (
  a: { variantId: string; lensConfig: unknown; unitPriceMinor: number },
  b: { variantId: string; lensConfig: unknown; unitPriceMinor: number },
) =>
  a.variantId === b.variantId &&
  a.unitPriceMinor === b.unitPriceMinor &&
  JSON.stringify(a.lensConfig) === JSON.stringify(b.lensConfig);

/**
 * Brings what a guest did in this browser into their account on sign-in:
 * the bag (lines merged, quantities added up to the per-item limit) and
 * prescription uploads. Prices stay as they were when each item was added.
 * Returns the number of items that came across.
 */
export async function mergeGuestInto(
  tx: Tx,
  userId: string,
  sessionHash: string | null,
  now = new Date(),
): Promise<number> {
  if (!sessionHash) return 0;
  await tx.prescription.updateMany({
    where: { ownerTokenHash: sessionHash, userId: null, deletedAt: null },
    data: { userId },
  });

  const guest = await tx.cart.findFirst({
    where: { guestTokenHash: sessionHash, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    include: { items: { orderBy: { createdAt: 'asc' } } },
  });
  if (!guest || guest.items.length === 0) {
    if (guest) await tx.cart.delete({ where: { id: guest.id } });
    return 0;
  }
  const moved = guest.items.reduce((sum, item) => sum + item.quantity, 0);

  const account = await tx.cart.findUnique({
    where: { userId },
    include: { items: true },
  });
  if (!account) {
    // No account bag yet: the guest bag becomes it.
    await tx.cart.update({
      where: { id: guest.id },
      data: { userId, guestTokenHash: null, expiresAt: null },
    });
    return moved;
  }

  let lines = account.items.length;
  for (const item of guest.items) {
    const match = account.items.find((existing) => sameLine(existing, item));
    if (match) {
      match.quantity = Math.min(MAX_ITEM_QUANTITY, match.quantity + item.quantity);
      await tx.cartItem.update({ where: { id: match.id }, data: { quantity: match.quantity } });
    } else if (lines < MAX_CART_LINES) {
      await tx.cartItem.update({ where: { id: item.id }, data: { cartId: account.id } });
      lines += 1;
    }
  }
  if (!account.couponCode && guest.couponCode)
    await tx.cart.update({ where: { id: account.id }, data: { couponCode: guest.couponCode } });
  await tx.cart.delete({ where: { id: guest.id } });
  return moved;
}
