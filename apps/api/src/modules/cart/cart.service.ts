import type { AddCartItem, Cart, CartItem } from '@optical/shared/checkout';
import { addCartItemSchema } from '@optical/shared/checkout';
import { quoteLens, type LensConfig, type LensFrameContext } from '@optical/shared/lens';
import { formatMoney } from '@optical/shared/money';
import { MAX_ITEM_QUANTITY, priceOrder, type PricingItem } from '@optical/shared/pricing';
import type { Prisma } from '../../generated/prisma/client';
import type { Db } from '../../infra/prisma';
import { AppError } from '../../lib/app-error';
import { isFirstOrder, loadCoupon } from '../checkout/coupons';
import type { LensService } from '../lens/lens.service';
import {
  CartRepository,
  type CartItemRow,
  type CartPriceSnapshot,
  type CartRow,
  type VariantRow,
} from './cart.repository';

/** Most separate lines a cart may hold. */
export const MAX_CART_LINES = 20;

export const availableUnits = (stock: { onHand: number; reserved: number } | null) =>
  Math.max(0, (stock?.onHand ?? 0) - (stock?.reserved ?? 0));

export const variantPrice = (variant: VariantRow) =>
  variant.priceOverrideMinor ?? variant.product.basePriceMinor;

export function frameContextOf(variant: VariantRow): LensFrameContext | null {
  const frame = variant.product.frame;
  if (!frame) return null;
  return {
    rimType: frame.rimType as LensFrameContext['rimType'],
    lensHeightMm: frame.lensHeightMm,
    lensWidthMm: frame.lensWidthMm,
  };
}

/** The pricing engine's view of cart lines, using the prices fixed when each was added. */
export function toPricingItems(items: readonly CartItemRow[]): PricingItem[] {
  return items.map((item) => {
    const snapshot = item.priceSnapshot as unknown as CartPriceSnapshot;
    return {
      key: item.id,
      name: item.variant.product.name,
      kind: item.variant.product.type === 'frame' ? 'frame' : 'accessory',
      unitPriceMinor: snapshot.framePriceMinor,
      quantity: item.quantity,
      ...(snapshot.lensLines.length ? { lensLines: snapshot.lensLines } : {}),
    };
  });
}

/** Units of each variant asked for across the whole cart. */
function unitsByVariant(items: readonly CartItemRow[]): Map<string, number> {
  const units = new Map<string, number>();
  for (const item of items)
    units.set(item.variantId, (units.get(item.variantId) ?? 0) + item.quantity);
  return units;
}

function toCartItem(item: CartItemRow, wantedOfVariant: number): CartItem {
  const snapshot = item.priceSnapshot as unknown as CartPriceSnapshot;
  const variant = item.variant;
  const live = variant.isActive && variant.product.isPublished && !variant.product.deletedAt;
  const units = availableUnits(variant.stock);
  // Room for this line: what's free after the variant's other lines in the cart.
  const othersOfVariant = wantedOfVariant - item.quantity;
  const maxQuantity = Math.max(0, Math.min(MAX_ITEM_QUANTITY, units - othersOfVariant));
  return {
    id: item.id,
    productId: variant.productId,
    productSlug: variant.product.slug,
    productName: variant.product.name,
    variantId: variant.id,
    colourName: variant.colourName,
    sku: variant.sku,
    imageUrl: variant.images[0]?.url ?? null,
    quantity: item.quantity,
    unitPriceMinor: item.unitPriceMinor,
    framePriceMinor: snapshot.framePriceMinor,
    lensConfig: (item.lensConfig as LensConfig | null) ?? null,
    lensLines: snapshot.lensLines,
    maxQuantity,
    issue: !live
      ? 'unavailable'
      : units === 0
        ? 'out-of-stock'
        : wantedOfVariant > units
          ? 'insufficient-stock'
          : null,
  };
}

/**
 * The guest bag. Every write re-prices on the server: lens choices are
 * re-quoted against the frame and the rules, and the result is stored as
 * an immutable snapshot, so later catalogue price changes never alter an
 * item already in the bag.
 */
export class CartService {
  private readonly carts: CartRepository;

  constructor(
    private readonly db: Db,
    private readonly lenses: LensService,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.carts = new CartRepository(db);
  }

  repository(): CartRepository {
    return this.carts;
  }

  async view(sessionHash: string | null): Promise<Cart> {
    const cart = sessionHash ? await this.carts.find(sessionHash, this.now()) : null;
    return this.toCart(cart);
  }

  async toCart(cart: CartRow | null): Promise<Cart> {
    const items = cart?.items ?? [];
    const coupon = cart?.couponCode ? await loadCoupon(this.db, cart.couponCode, null) : null;
    const wanted = unitsByVariant(items);
    const pricing = priceOrder({
      items: toPricingItems(items),
      coupon,
      now: this.now(),
      isFirstOrder: true,
      shipping: { speed: 'standard' },
      paymentMethod: 'prepaid',
    });
    return {
      items: items.map((item) => toCartItem(item, wanted.get(item.variantId) ?? 0)),
      itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
      couponCode: cart?.couponCode ?? null,
      pricing,
    };
  }

  /** Quotes lenses for a variant and returns the stored price parts. Throws on anything invalid. */
  private async price(
    variant: VariantRow,
    lensConfig: LensConfig | null,
    sessionHash: string,
  ): Promise<{ snapshot: CartPriceSnapshot; config: LensConfig | null; unitPriceMinor: number }> {
    const framePriceMinor = variantPrice(variant);
    if (!lensConfig)
      return {
        snapshot: { framePriceMinor, lensLines: [] },
        config: null,
        unitPriceMinor: framePriceMinor,
      };

    const frame = frameContextOf(variant);
    if (!variant.product.lensesAvailable || !frame)
      throw new AppError('VALIDATION_FAILED', 'This product is sold without lenses.', [
        { path: 'lensConfig', message: 'Lenses are not available for this product.' },
      ]);
    const quote = quoteLens(await this.lenses.options(), lensConfig, frame);
    if (!quote.ok)
      throw new AppError(
        'VALIDATION_FAILED',
        'Some lens choices need attention.',
        quote.errors.map((error) => ({ path: `lensConfig.${error.path}`, message: error.message })),
      );
    const source = quote.config.prescription;
    if (source?.mode === 'saved')
      throw new AppError('VALIDATION_FAILED', 'Sign in to use a saved prescription.', [
        { path: 'lensConfig.prescription', message: 'Saved prescriptions need an account.' },
      ]);
    if (source?.mode === 'upload' && !(await this.carts.ownedUpload(source.uploadId, sessionHash)))
      throw new AppError(
        'VALIDATION_FAILED',
        'We could not find that prescription upload. Upload it again.',
        [{ path: 'lensConfig.prescription.uploadId', message: 'Upload not found.' }],
      );
    return {
      snapshot: { framePriceMinor, lensLines: quote.lines },
      config: quote.config,
      unitPriceMinor: framePriceMinor + quote.totalMinor,
    };
  }

  async addItem(sessionHash: string, input: AddCartItem): Promise<Cart> {
    const request = addCartItemSchema.parse(input);
    const variant = await this.carts.variant(request.variantId);
    if (!variant) throw AppError.notFound('That frame or colour is no longer available.');
    const priced = await this.price(variant, request.lensConfig, sessionHash);

    if (
      request.expectedUnitPriceMinor !== undefined &&
      request.expectedUnitPriceMinor !== priced.unitPriceMinor
    ) {
      throw new AppError(
        'PRICE_CHANGED',
        `The price has changed to ${formatMoney(priced.unitPriceMinor)}. Check it and add again.`,
        [{ path: 'expectedUnitPriceMinor', message: String(priced.unitPriceMinor) }],
      );
    }

    const cart = await this.carts.findOrCreate(sessionHash, this.now());
    const sameConfig = JSON.stringify(priced.config);
    const existing = cart.items.find(
      (item) =>
        item.variantId === variant.id &&
        JSON.stringify(item.lensConfig) === sameConfig &&
        item.unitPriceMinor === priced.unitPriceMinor,
    );
    if (!existing && cart.items.length >= MAX_CART_LINES)
      throw new AppError('CONFLICT', `Your bag can hold up to ${MAX_CART_LINES} different items.`);

    const wanted = (unitsByVariant(cart.items).get(variant.id) ?? 0) + request.quantity;
    const units = availableUnits(variant.stock);
    if (wanted > units)
      throw new AppError(
        'OUT_OF_STOCK',
        units === 0
          ? `${variant.product.name} in ${variant.colourName} is out of stock.`
          : `Only ${units} of ${variant.product.name} in ${variant.colourName} ${units === 1 ? 'is' : 'are'} available.`,
      );

    if (existing) {
      const quantity = existing.quantity + request.quantity;
      if (quantity > MAX_ITEM_QUANTITY)
        throw new AppError(
          'VALIDATION_FAILED',
          `You can order up to ${MAX_ITEM_QUANTITY} of one item.`,
        );
      await this.carts.updateQuantity(cart.id, existing.id, quantity);
    } else {
      await this.carts.addItem({
        cartId: cart.id,
        variantId: variant.id,
        quantity: request.quantity,
        lensConfig: priced.config ?? undefined,
        priceSnapshot: priced.snapshot as unknown as Prisma.InputJsonValue,
        unitPriceMinor: priced.unitPriceMinor,
      });
    }
    return this.view(sessionHash);
  }

  async updateQuantity(
    sessionHash: string | null,
    itemId: string,
    quantity: number,
  ): Promise<Cart> {
    const cart = sessionHash ? await this.carts.find(sessionHash, this.now()) : null;
    const item = cart?.items.find((entry) => entry.id === itemId);
    if (!cart || !item) throw AppError.notFound('That item is no longer in your bag.');
    if (quantity > item.quantity) {
      const wanted =
        (unitsByVariant(cart.items).get(item.variantId) ?? 0) - item.quantity + quantity;
      const units = availableUnits(item.variant.stock);
      if (wanted > units)
        throw new AppError(
          'OUT_OF_STOCK',
          `Only ${units} of this frame ${units === 1 ? 'is' : 'are'} available.`,
        );
    }
    await this.carts.updateQuantity(cart.id, itemId, quantity);
    return this.view(sessionHash);
  }

  async removeItem(sessionHash: string | null, itemId: string): Promise<Cart> {
    const cart = sessionHash ? await this.carts.find(sessionHash, this.now()) : null;
    if (cart) await this.carts.removeItem(cart.id, itemId);
    return this.view(sessionHash);
  }

  /** Applies a coupon if it would take something off now; otherwise explains why not. */
  async applyCoupon(sessionHash: string | null, code: string): Promise<Cart> {
    const cart = sessionHash ? await this.carts.find(sessionHash, this.now()) : null;
    if (!cart || cart.items.length === 0)
      throw new AppError('VALIDATION_FAILED', 'Add something to your bag before using a code.');
    const coupon = await loadCoupon(this.db, code, null);
    if (!coupon)
      throw new AppError(
        'VALIDATION_FAILED',
        `We don't recognise the code ${code}. Check the spelling.`,
        [{ path: 'code', message: 'Unknown code.' }],
      );
    const pricing = priceOrder({
      items: toPricingItems(cart.items),
      coupon,
      now: this.now(),
      isFirstOrder: await isFirstOrder(this.db, null),
      shipping: { speed: 'standard' },
      paymentMethod: 'prepaid',
    });
    if (pricing.coupon && !pricing.coupon.applied)
      throw new AppError('VALIDATION_FAILED', pricing.coupon.message, [
        { path: 'code', message: pricing.coupon.message },
      ]);
    await this.carts.setCoupon(cart.id, coupon.code);
    return this.view(sessionHash);
  }

  async removeCoupon(sessionHash: string | null): Promise<Cart> {
    const cart = sessionHash ? await this.carts.find(sessionHash, this.now()) : null;
    if (cart) await this.carts.setCoupon(cart.id, null);
    return this.view(sessionHash);
  }
}
