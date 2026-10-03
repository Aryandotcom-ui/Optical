import type { CommerceConfig } from '@optical/config/commerce';
import { z } from 'zod';

const minor = z.number().int().min(0).max(10_000_000_00);

/**
 * Market values the admin can change without a deploy. They apply to every
 * quote and order from the moment they are saved. Tax rates, shipping zones
 * and policies stay in code: they change legal copy and promises too.
 */
export const marketSettingsSchema = z
  .object({
    freeShippingThresholdMinor: minor,
    standardFeeMinor: minor,
    expressFeeMinor: minor,
    codEnabled: z.boolean(),
    codFeeMinor: minor,
    codMaxOrderTotalMinor: minor,
    /** Default low-stock threshold for new variants. */
    lowStockThreshold: z.number().int().min(0).max(1000),
  })
  .meta({ id: 'MarketSettings' });
export type MarketSettings = z.infer<typeof marketSettingsSchema>;

export const DEFAULT_LOW_STOCK_THRESHOLD = 5;

export function marketSettingsFrom(market: CommerceConfig): MarketSettings {
  return {
    freeShippingThresholdMinor: market.shipping.freeShippingThresholdMinor,
    standardFeeMinor: market.shipping.standardFeeMinor,
    expressFeeMinor: market.shipping.expressFeeMinor,
    codEnabled: market.cashOnDelivery.enabled,
    codFeeMinor: market.cashOnDelivery.feeMinor,
    codMaxOrderTotalMinor: market.cashOnDelivery.maxOrderTotalMinor,
    lowStockThreshold: DEFAULT_LOW_STOCK_THRESHOLD,
  };
}

/** The market with saved settings applied over the code defaults. */
export function applyMarketSettings(
  market: CommerceConfig,
  settings: Partial<MarketSettings>,
): CommerceConfig {
  return {
    ...market,
    shipping: {
      ...market.shipping,
      freeShippingThresholdMinor:
        settings.freeShippingThresholdMinor ?? market.shipping.freeShippingThresholdMinor,
      standardFeeMinor: settings.standardFeeMinor ?? market.shipping.standardFeeMinor,
      expressFeeMinor: settings.expressFeeMinor ?? market.shipping.expressFeeMinor,
    },
    cashOnDelivery: {
      enabled: settings.codEnabled ?? market.cashOnDelivery.enabled,
      feeMinor: settings.codFeeMinor ?? market.cashOnDelivery.feeMinor,
      maxOrderTotalMinor:
        settings.codMaxOrderTotalMinor ?? market.cashOnDelivery.maxOrderTotalMinor,
    },
  };
}

/** What the storefront shows: public, cacheable, no secrets. */
export const publicSettingsSchema = z
  .object({
    market: marketSettingsSchema.omit({ lowStockThreshold: true }),
    flags: z.object({ virtualTryOn: z.boolean(), frameFinder: z.boolean() }),
  })
  .meta({ id: 'PublicSettings' });
export type PublicSettings = z.infer<typeof publicSettingsSchema>;
