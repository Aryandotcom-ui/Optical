import { commerce } from '@optical/config/commerce';
import type { OrderView, PaymentProviderCode } from '@optical/shared/checkout';
import type { LensConfig } from '@optical/shared/lens';
import { localIsoDate } from '@optical/shared/pricing/delivery';
import { happyPath, orderStatusCopy, type OrderStatus } from '@optical/shared/orders';
import type { PriceLine } from '@optical/shared/pricing';
import type { OrderRow } from './orders.repository';

export const providerCode = (provider: OrderRow['paymentProvider']) =>
  provider.toLowerCase() as PaymentProviderCode;

/** True when any item has lenses, which are made to order. */
export const needsProduction = (order: Pick<OrderRow, 'items'>) =>
  order.items.some((item) => item.lensConfig !== null);

function statusCopy(order: OrderRow): { label: string; description: string } {
  // Cash-on-delivery orders go ahead unpaid; "awaiting payment" would alarm.
  if (order.paymentProvider === 'COD' && order.status === 'PENDING_PAYMENT')
    return { label: 'Order confirmed', description: 'You pay in cash when your order arrives.' };
  if (order.status === 'PENDING_PAYMENT' && order.payments[0]?.status === 'PENDING')
    return {
      label: 'Payment processing',
      description: 'Your bank is confirming the payment. This usually takes a few minutes.',
    };
  return orderStatusCopy[order.status];
}

export function canRetryPayment(order: OrderRow): boolean {
  if (order.paymentProvider === 'COD') return false;
  if (order.status === 'PAYMENT_FAILED') return true;
  return order.status === 'PENDING_PAYMENT' && order.payments[0]?.status !== 'PENDING';
}

export function lensSummary(priceLines: unknown): string[] {
  return (priceLines as PriceLine[])
    .filter((line) => line.kind.startsWith('lens-'))
    .map((line) => line.label);
}

export function toOrderView(order: OrderRow): OrderView {
  const address = order.shippingAddress as unknown as OrderView['shippingAddress'];
  const reached = new Set(order.events.map((event) => event.toStatus));
  const cod = order.paymentProvider === 'COD';
  const path = happyPath({
    needsProduction: needsProduction(order),
    cashOnDelivery: cod,
    prescriptionProvidedLater: order.awaitingPrescription,
  });
  const terminal: OrderStatus[] = ['CANCELLED', 'REFUNDED', 'RETURNED', 'DELIVERED'];
  const copy = statusCopy(order);
  const payment = order.payments[0];
  const holds = order.reservations.map((hold) => hold.expiresAt.getTime());

  return {
    number: order.number,
    status: order.status,
    statusLabel: copy.label,
    statusDescription: copy.description,
    placedAt: order.placedAt.toISOString(),
    email: order.email,
    paymentProvider: providerCode(order.paymentProvider),
    payment: payment
      ? { id: payment.id, status: payment.status, failureReason: payment.failureReason }
      : null,
    canRetryPayment: canRetryPayment(order),
    reservedUntil: holds.length ? new Date(Math.min(...holds)).toISOString() : null,
    items: order.items.map((item) => {
      const config = item.lensConfig as LensConfig | null;
      const source = config?.prescription ?? null;
      return {
        id: item.id,
        productName: item.productName,
        productSlug: item.variant.product.slug,
        colourName: item.colourName,
        imageUrl: item.imageUrl,
        quantity: item.quantity,
        totalMinor: item.totalMinor,
        lensSummary: lensSummary(item.priceLines),
        prescription: source
          ? {
              mode: source.mode,
              provided: source.mode === 'manual' || item.prescriptionId !== null,
              requiresAdd: config?.purpose === 'progressive',
            }
          : null,
      };
    }),
    totals: {
      subtotalMinor: order.subtotalMinor,
      discountMinor: order.discountMinor,
      shippingMinor: order.shippingMinor,
      codFeeMinor: order.codFeeMinor,
      taxMinor: order.taxMinor,
      totalMinor: order.totalMinor,
      taxName: commerce.tax.name,
      couponCode: order.couponCode,
    },
    shippingAddress: address,
    shippingSpeed: order.shippingSpeed === 'express' ? 'express' : 'standard',
    estimatedDelivery:
      order.estimatedDeliveryFrom && order.estimatedDeliveryTo
        ? {
            earliest: localIsoDate(order.estimatedDeliveryFrom, 'UTC'),
            latest: localIsoDate(order.estimatedDeliveryTo, 'UTC'),
          }
        : null,
    awaitingPrescription: order.awaitingPrescription,
    timeline: order.events.map((event) => ({
      status: event.toStatus,
      label:
        event.toStatus === 'PENDING_PAYMENT'
          ? 'Order placed'
          : orderStatusCopy[event.toStatus].label,
      at: event.createdAt.toISOString(),
    })),
    upcoming: terminal.includes(order.status)
      ? []
      : path
          .filter((status) => !reached.has(status))
          .map((status) => ({ status, label: orderStatusCopy[status].label })),
    shipment:
      order.carrier && order.trackingNumber
        ? { carrier: order.carrier, trackingNumber: order.trackingNumber }
        : null,
  };
}
