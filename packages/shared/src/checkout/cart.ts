import { z } from 'zod';
import { lensQuoteLineSchema } from '../lens/api';
import { lensConfigSchema } from '../lens/config';
import { MAX_ITEM_QUANTITY } from '../pricing/engine';
import { pricingSchema } from './pricing';

export const cartItemIssues = ['unavailable', 'out-of-stock', 'insufficient-stock'] as const;

export const cartItemSchema = z
  .object({
    id: z.uuid(),
    productId: z.uuid(),
    productSlug: z.string(),
    productName: z.string(),
    variantId: z.uuid(),
    colourName: z.string(),
    sku: z.string(),
    imageUrl: z.string().nullable(),
    quantity: z.number().int(),
    /** Frame plus lenses, per unit, fixed when the item was added. */
    unitPriceMinor: z.number().int(),
    framePriceMinor: z.number().int(),
    lensConfig: lensConfigSchema.nullable(),
    lensLines: z.array(lensQuoteLineSchema),
    /** Most units that can be ordered now (stock and the per-item limit). */
    maxQuantity: z.number().int(),
    issue: z.enum(cartItemIssues).nullable(),
  })
  .meta({ id: 'CartItem' });
export type CartItem = z.infer<typeof cartItemSchema>;

export const cartSchema = z
  .object({
    items: z.array(cartItemSchema),
    itemCount: z.number().int(),
    couponCode: z.string().nullable(),
    /** Standard delivery to an unknown address; checkout prices the real one. */
    pricing: pricingSchema,
  })
  .meta({ id: 'Cart' });
export type Cart = z.infer<typeof cartSchema>;

export const addCartItemSchema = z
  .object({
    variantId: z.uuid(),
    quantity: z.number().int().min(1).max(MAX_ITEM_QUANTITY).default(1),
    /** Lens choices; null or omitted for frame only, sunglasses and accessories. */
    lensConfig: lensConfigSchema.nullable().default(null),
    /**
     * The per-unit price the customer saw. When it differs from the
     * server's price the item is not added and `PRICE_CHANGED` comes back.
     */
    expectedUnitPriceMinor: z.number().int().nonnegative().optional(),
  })
  .meta({ id: 'AddCartItem' });
export type AddCartItem = z.input<typeof addCartItemSchema>;

export const updateCartItemSchema = z.object({
  quantity: z.number().int().min(1).max(MAX_ITEM_QUANTITY),
});

export const couponCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9-]{3,32}$/, 'Coupon codes are 3 to 32 letters and numbers.');

export const applyCouponSchema = z.object({ code: couponCodeSchema });
