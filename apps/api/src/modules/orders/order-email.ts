import { commerce } from '@optical/config/commerce';
import type { OrderEmailData } from '../../emails/order-email';
import { lensSummary, providerCode } from './orders.mapper';
import type { OrderRow } from './orders.repository';

/** The link in emails: the order page with its access token. */
export function orderUrl(siteUrl: string, number: string, token: string): string {
  return `${siteUrl}/order/${number}?token=${encodeURIComponent(token)}`;
}

export function orderEmailData(order: OrderRow, url: string): OrderEmailData {
  const address = order.shippingAddress as unknown as {
    fullName: string;
    line1: string;
    line2: string | null;
    city: string;
    region: string;
    postalCode: string;
  };
  const toDate = (date: Date | null) => date?.toISOString().slice(0, 10) ?? null;
  const from = toDate(order.estimatedDeliveryFrom);
  const to = toDate(order.estimatedDeliveryTo);
  return {
    number: order.number,
    customerName: address.fullName.split(/\s+/)[0] ?? address.fullName,
    orderUrl: url,
    paymentProvider: providerCode(order.paymentProvider),
    awaitingPrescription: order.awaitingPrescription,
    items: order.items.map((item) => ({
      name: item.productName,
      colour: item.colourName,
      quantity: item.quantity,
      totalMinor: item.totalMinor,
      lens: lensSummary(item.priceLines),
    })),
    totals: {
      subtotalMinor: order.subtotalMinor,
      discountMinor: order.discountMinor,
      shippingMinor: order.shippingMinor,
      codFeeMinor: order.codFeeMinor,
      taxMinor: order.taxMinor,
      totalMinor: order.totalMinor,
      taxName: commerce.tax.name,
    },
    delivery: from && to ? { earliest: from, latest: to } : null,
    address: [
      address.line1,
      ...(address.line2 ? [address.line2] : []),
      address.city,
      `${address.region} ${address.postalCode}`,
    ],
  };
}
