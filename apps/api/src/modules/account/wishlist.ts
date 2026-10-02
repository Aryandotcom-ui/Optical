import type { Wishlist } from '@optical/shared/account';
import type { Db } from '../../infra/prisma';
import { AppError } from '../../lib/app-error';
import { randomToken } from '../../lib/tokens';

export const WISHLIST_LIMIT = 100;
/** Share links use 128 random bits: unguessable, and short enough to paste. */
const newShareToken = () => randomToken(16);
export const SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/;

/**
 * The account wishlist. Guests keep theirs in the browser; on sign-in the
 * two are merged here, and while signed in every change is saved here so it
 * follows the customer across devices. A read-only link can be shared.
 */
export class WishlistService {
  constructor(private readonly db: Db) {}

  private async ensure(userId: string) {
    return this.db.wishlist.upsert({
      where: { userId },
      create: { userId, shareToken: newShareToken() },
      update: {},
      select: { id: true, shareToken: true },
    });
  }

  async get(userId: string): Promise<Wishlist> {
    const list = await this.ensure(userId);
    const items = await this.db.wishlistItem.findMany({
      where: { wishlistId: list.id, product: { isPublished: true, deletedAt: null } },
      orderBy: { createdAt: 'desc' },
      select: { product: { select: { id: true, slug: true } } },
    });
    return { items: items.map((item) => item.product), shareToken: list.shareToken };
  }

  /** Adds products the account doesn't have yet, keeping the newest first. Unknown ids are ignored. */
  async merge(userId: string, items: { id: string }[]): Promise<Wishlist> {
    const list = await this.ensure(userId);
    const ids = [...new Set(items.map((item) => item.id))];
    if (ids.length) {
      const existing = await this.db.wishlistItem.count({ where: { wishlistId: list.id } });
      const products = await this.db.product.findMany({
        where: { id: { in: ids }, isPublished: true, deletedAt: null },
        select: { id: true },
      });
      const known = new Set(products.map((product) => product.id));
      const room = Math.max(0, WISHLIST_LIMIT - existing);
      // Browser lists are newest first; give earlier entries later timestamps.
      const now = Date.now();
      const rows = ids
        .filter((id) => known.has(id))
        .slice(0, room)
        .map((productId, index) => ({
          wishlistId: list.id,
          productId,
          createdAt: new Date(now - index),
        }));
      await this.db.wishlistItem.createMany({ data: rows, skipDuplicates: true });
    }
    return this.get(userId);
  }

  async add(userId: string, productId: string): Promise<Wishlist> {
    const list = await this.ensure(userId);
    const product = await this.db.product.findFirst({
      where: { id: productId, isPublished: true, deletedAt: null },
      select: { id: true },
    });
    if (!product) throw AppError.notFound('That frame is no longer available.');
    const count = await this.db.wishlistItem.count({ where: { wishlistId: list.id } });
    if (count >= WISHLIST_LIMIT)
      throw new AppError(
        'CONFLICT',
        `Your wishlist can hold ${WISHLIST_LIMIT} frames. Remove one to add another.`,
      );
    await this.db.wishlistItem.createMany({
      data: [{ wishlistId: list.id, productId }],
      skipDuplicates: true,
    });
    return this.get(userId);
  }

  async remove(userId: string, productId: string): Promise<Wishlist> {
    const list = await this.ensure(userId);
    await this.db.wishlistItem.deleteMany({ where: { wishlistId: list.id, productId } });
    return this.get(userId);
  }

  /** A new share link; the old one stops working. */
  async resetShareLink(userId: string): Promise<Wishlist> {
    const list = await this.ensure(userId);
    await this.db.wishlist.update({
      where: { id: list.id },
      data: { shareToken: newShareToken() },
    });
    return this.get(userId);
  }

  /** The read-only view behind a share link. Says nothing about whose list it is. */
  async shared(token: string): Promise<{ items: { id: string; slug: string }[] }> {
    const list = SHARE_TOKEN_PATTERN.test(token)
      ? await this.db.wishlist.findUnique({
          where: { shareToken: token },
          select: { userId: true },
        })
      : null;
    if (!list?.userId) throw AppError.notFound('This wishlist link is no longer shared.');
    const { items } = await this.get(list.userId);
    return { items };
  }
}
