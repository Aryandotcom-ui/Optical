import type { Prisma } from '../../generated/prisma/client';
import type { Db } from '../../infra/prisma';
import type { Owner } from '../../plugins/auth';

export const variantInclude = {
  product: { include: { frame: true } },
  images: { where: { kind: 'front' }, orderBy: { position: 'asc' }, take: 1 },
  stock: true,
} satisfies Prisma.ProductVariantInclude;

export const cartInclude = {
  items: { orderBy: { createdAt: 'asc' }, include: { variant: { include: variantInclude } } },
} satisfies Prisma.CartInclude;

export type CartRow = Prisma.CartGetPayload<{ include: typeof cartInclude }>;
export type CartItemRow = CartRow['items'][number];
export type VariantRow = Prisma.ProductVariantGetPayload<{ include: typeof variantInclude }>;

/** Price parts stored on a cart item when it is added. */
export interface CartPriceSnapshot {
  framePriceMinor: number;
  lensLines: {
    kind: 'base' | 'index' | 'package' | 'coating' | 'tint';
    code: string;
    label: string;
    priceMinor: number;
  }[];
}

/** Guest carts last as long as the session cookie: 30 days from the last change. */
export const CART_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export class CartRepository {
  constructor(private readonly db: Db) {}

  /** A signed-in customer's bag, or the guest bag for this browser. */
  find(owner: Owner, now = new Date()): Promise<CartRow | null> {
    if (owner.userId)
      return this.db.cart.findUnique({ where: { userId: owner.userId }, include: cartInclude });
    if (!owner.sessionHash) return Promise.resolve(null);
    return this.db.cart.findFirst({
      where: {
        guestTokenHash: owner.sessionHash,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      include: cartInclude,
    });
  }

  /** Account bags don't expire; guest bags last 30 days from the last change. */
  async findOrCreate(owner: Owner, now = new Date()): Promise<CartRow> {
    if (owner.userId)
      return this.db.cart.upsert({
        where: { userId: owner.userId },
        create: { userId: owner.userId },
        update: {},
        include: cartInclude,
      });
    if (!owner.sessionHash) throw new Error('A guest bag needs a session.');
    const expiresAt = new Date(now.getTime() + CART_TTL_MS);
    return this.db.cart.upsert({
      where: { guestTokenHash: owner.sessionHash },
      create: { guestTokenHash: owner.sessionHash, expiresAt },
      update: { expiresAt },
      include: cartInclude,
    });
  }

  variant(variantId: string): Promise<VariantRow | null> {
    return this.db.productVariant.findFirst({
      where: { id: variantId, isActive: true, product: { isPublished: true, deletedAt: null } },
      include: variantInclude,
    });
  }

  addItem(data: Prisma.CartItemUncheckedCreateInput) {
    return this.db.cartItem.create({ data });
  }

  updateQuantity(cartId: string, itemId: string, quantity: number) {
    return this.db.cartItem.updateMany({ where: { id: itemId, cartId }, data: { quantity } });
  }

  removeItem(cartId: string, itemId: string) {
    return this.db.cartItem.deleteMany({ where: { id: itemId, cartId } });
  }

  setCoupon(cartId: string, couponCode: string | null) {
    return this.db.cart.update({ where: { id: cartId }, data: { couponCode } });
  }

  /** An uploaded prescription file, if it belongs to this browser or account. */
  ownedUpload(uploadId: string, owner: Owner) {
    const owners = ownedBy(owner);
    if (owners.length === 0) return Promise.resolve(null);
    return this.db.prescription.findFirst({
      where: { id: uploadId, fileKey: { not: null }, deletedAt: null, OR: owners },
      select: { id: true },
    });
  }

  /** A prescription saved to the signed-in customer's account. */
  savedPrescription(prescriptionId: string, userId: string) {
    return this.db.prescription.findFirst({
      where: { id: prescriptionId, userId, deletedAt: null },
      select: { id: true, values: true, fileKey: true },
    });
  }
}

/** Prescription ownership: uploaded from this browser, or saved to this account. */
export function ownedBy(owner: Owner): Prisma.PrescriptionWhereInput[] {
  return [
    ...(owner.sessionHash ? [{ ownerTokenHash: owner.sessionHash }] : []),
    ...(owner.userId ? [{ userId: owner.userId }] : []),
  ];
}
