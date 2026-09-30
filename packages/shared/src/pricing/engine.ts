import { commerce, shippingZoneFor, type CommerceConfig } from '@optical/config/commerce';
import type { LensLineKind, LensQuoteLine } from '../lens/quote';
import { extractInclusiveTax, formatMoney, sumMinorUnits, type MinorUnits } from '../money/money';
import { allocateProportionally } from './allocate';
import { evaluateCoupon, type CouponDefinition, type CouponRejection } from './coupon';

export const MAX_ITEM_QUANTITY = 10;
export type ShippingSpeed = 'standard' | 'express';
export type PaymentMethodKind = 'prepaid' | 'cod';

export interface PricingItem {
  /** Stable identifier, e.g. the cart item id. */
  key: string;
  name: string;
  kind: 'frame' | 'accessory';
  unitPriceMinor: MinorUnits;
  quantity: number;
  /** Lens lines per unit, from `quoteLens`. Omit for frame-only and accessories. */
  lensLines?: readonly LensQuoteLine[];
}

export interface PricingInput {
  items: readonly PricingItem[];
  coupon?: CouponDefinition | null;
  now: Date;
  isFirstOrder: boolean;
  shipping: { speed: ShippingSpeed; postalCode?: string | null };
  paymentMethod: PaymentMethodKind;
  market?: CommerceConfig;
}

export type PriceLineKind = 'frame' | 'accessory' | `lens-${LensLineKind}`;

export interface PriceLine {
  itemKey: string;
  kind: PriceLineKind;
  code: string | null;
  label: string;
  unitPriceMinor: MinorUnits;
  quantity: number;
  /** unitPrice × quantity, before discount. */
  amountMinor: MinorUnits;
  /** This line's share of the order discount. */
  discountMinor: MinorUnits;
  /** Tax contained in (amount − discount); prices are tax-inclusive. */
  taxMinor: MinorUnits;
}

export type PricingIssue =
  | { code: 'invalid-quantity'; itemKey: string; message: string }
  | { code: 'cod-unavailable'; message: string };

export interface PricingResult {
  currency: string;
  lines: PriceLine[];
  subtotalMinor: MinorUnits;
  discountMinor: MinorUnits;
  shipping: {
    speed: ShippingSpeed;
    zoneCode: string;
    feeMinor: MinorUnits;
    /** True when the standard fee was waived (threshold or coupon). */
    freeStandard: boolean;
    /** Amount still needed for free standard shipping, or 0. */
    remainingForFreeMinor: MinorUnits;
    taxMinor: MinorUnits;
  };
  codFee: { feeMinor: MinorUnits; taxMinor: MinorUnits };
  totalMinor: MinorUnits;
  tax: { name: string; rateBasisPoints: number; totalMinor: MinorUnits; netMinor: MinorUnits };
  coupon:
    | { code: string; applied: true; discountMinor: MinorUnits; freeShipping: boolean }
    | { code: string; applied: false; reason: CouponRejection; message: string }
    | null;
  cashOnDelivery: { available: boolean; reason: string | null };
  /** Problems that must be fixed before an order can be placed. */
  issues: PricingIssue[];
}

function expandLines(item: PricingItem): Omit<PriceLine, 'discountMinor' | 'taxMinor'>[] {
  const lines: Omit<PriceLine, 'discountMinor' | 'taxMinor'>[] = [
    {
      itemKey: item.key,
      kind: item.kind,
      code: null,
      label: item.name,
      unitPriceMinor: item.unitPriceMinor,
      quantity: item.quantity,
      amountMinor: item.unitPriceMinor * item.quantity,
    },
  ];
  for (const lens of item.lensLines ?? []) {
    lines.push({
      itemKey: item.key,
      kind: `lens-${lens.kind}`,
      code: lens.code,
      label: lens.label,
      unitPriceMinor: lens.priceMinor,
      quantity: item.quantity,
      amountMinor: lens.priceMinor * item.quantity,
    });
  }
  return lines;
}

/**
 * Prices an order: itemised lines, coupon, shipping, COD fee and the tax
 * contained in each. Pure, deterministic and integer-only. The web app
 * uses it for display; the API recomputes it and trusts only its own run.
 *
 * Rules:
 * - Prices include tax. Tax is extracted per line after its discount share,
 *   and from shipping and COD fees, then summed.
 * - The discount is split across lines in proportion to their amounts.
 * - Standard shipping is free at or above the threshold (after discount) or
 *   with a free-shipping coupon; express then costs only the upgrade.
 * - Zone surcharges always apply.
 */
export function priceOrder(input: PricingInput): PricingResult {
  const market = input.market ?? commerce;
  const issues: PricingIssue[] = [];

  for (const item of input.items) {
    if (
      !Number.isInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > MAX_ITEM_QUANTITY
    ) {
      issues.push({
        code: 'invalid-quantity',
        itemKey: item.key,
        message: `Quantity must be between 1 and ${MAX_ITEM_QUANTITY}.`,
      });
    }
  }
  const validItems = input.items.filter(
    (item) =>
      !issues.some((issue) => issue.code === 'invalid-quantity' && issue.itemKey === item.key),
  );
  const baseLines = validItems.flatMap(expandLines);
  const subtotal = sumMinorUnits(baseLines.map((line) => line.amountMinor));

  // Coupon.
  let discount = 0;
  let couponFreeShipping = false;
  let couponResult: PricingResult['coupon'] = null;
  if (input.coupon) {
    const evaluation = evaluateCoupon(input.coupon, {
      now: input.now,
      isFirstOrder: input.isFirstOrder,
      subtotalMinor: subtotal,
    });
    if (evaluation.eligible) {
      discount = evaluation.discountMinor;
      couponFreeShipping = evaluation.freeShipping;
      couponResult = {
        code: input.coupon.code,
        applied: true,
        discountMinor: discount,
        freeShipping: couponFreeShipping,
      };
    } else {
      couponResult = {
        code: input.coupon.code,
        applied: false,
        reason: evaluation.reason,
        message: evaluation.message,
      };
    }
  }

  const discounts =
    subtotal > 0
      ? allocateProportionally(
          discount,
          baseLines.map((line) => line.amountMinor),
        )
      : baseLines.map(() => 0);
  const lines: PriceLine[] = baseLines.map((line, index) => {
    const lineDiscount = discounts[index] ?? 0;
    return {
      ...line,
      discountMinor: lineDiscount,
      taxMinor: extractInclusiveTax(line.amountMinor - lineDiscount, market.tax.rateBasisPoints)
        .tax,
    };
  });

  // Shipping.
  const afterDiscount = subtotal - discount;
  const zone = shippingZoneFor(input.shipping.postalCode, market);
  const { standardFeeMinor, expressFeeMinor, freeShippingThresholdMinor } = market.shipping;
  const meetsThreshold = afterDiscount >= freeShippingThresholdMinor;
  const freeStandard = validItems.length > 0 && (meetsThreshold || couponFreeShipping);
  let shippingFee = 0;
  if (validItems.length > 0) {
    const speedFee = input.shipping.speed === 'express' ? expressFeeMinor : standardFeeMinor;
    shippingFee = (freeStandard ? speedFee - standardFeeMinor : speedFee) + zone.surchargeMinor;
  }
  const shippingTax = extractInclusiveTax(shippingFee, market.tax.rateBasisPoints).tax;

  // Cash on delivery.
  const cod = market.cashOnDelivery;
  const totalBeforeCod = afterDiscount + shippingFee;
  let codAvailable =
    cod.enabled && validItems.length > 0 && totalBeforeCod + cod.feeMinor <= cod.maxOrderTotalMinor;
  let codReason: string | null = null;
  if (!cod.enabled) codReason = 'Cash on delivery is not offered.';
  else if (!codAvailable && validItems.length > 0) {
    codReason = `Cash on delivery is available for orders up to ${formatMoney(cod.maxOrderTotalMinor, { market })}.`;
  }
  if (validItems.length === 0) codAvailable = false;
  const codFee = input.paymentMethod === 'cod' && codAvailable ? cod.feeMinor : 0;
  if (input.paymentMethod === 'cod' && !codAvailable) {
    issues.push({
      code: 'cod-unavailable',
      message: codReason ?? 'Cash on delivery is not available for this order.',
    });
  }
  const codTax = extractInclusiveTax(codFee, market.tax.rateBasisPoints).tax;

  const total = afterDiscount + shippingFee + codFee;
  const taxTotal = sumMinorUnits([...lines.map((line) => line.taxMinor), shippingTax, codTax]);

  return {
    currency: market.currency,
    lines,
    subtotalMinor: subtotal,
    discountMinor: discount,
    shipping: {
      speed: input.shipping.speed,
      zoneCode: zone.code,
      feeMinor: shippingFee,
      freeStandard,
      remainingForFreeMinor:
        validItems.length > 0 && !freeStandard ? freeShippingThresholdMinor - afterDiscount : 0,
      taxMinor: shippingTax,
    },
    codFee: { feeMinor: codFee, taxMinor: codTax },
    totalMinor: total,
    tax: {
      name: market.tax.name,
      rateBasisPoints: market.tax.rateBasisPoints,
      totalMinor: taxTotal,
      netMinor: total - taxTotal,
    },
    coupon: couponResult,
    cashOnDelivery: { available: codAvailable, reason: codAvailable ? null : codReason },
    issues,
  };
}
