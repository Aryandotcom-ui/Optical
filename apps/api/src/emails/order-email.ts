import { commerce } from '@optical/config/commerce';
import { formatMoney } from '@optical/shared/money';

/** Everything an order email shows, captured when the email is queued. */
export interface OrderEmailData {
  number: string;
  customerName: string;
  orderUrl: string;
  paymentProvider: 'mock' | 'razorpay' | 'stripe' | 'cod';
  awaitingPrescription: boolean;
  items: { name: string; colour: string; quantity: number; totalMinor: number; lens: string[] }[];
  totals: {
    subtotalMinor: number;
    discountMinor: number;
    shippingMinor: number;
    codFeeMinor: number;
    taxMinor: number;
    totalMinor: number;
    taxName: string;
  };
  delivery: { earliest: string; latest: string } | null;
  address: string[];
}

export const money = (minor: number) => formatMoney(minor);

const dateFormat = new Intl.DateTimeFormat(commerce.locale, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

/** "Mon, 21 Sep – Wed, 23 Sep" from YYYY-MM-DD dates. */
export function deliveryWindow(window: { earliest: string; latest: string }): string {
  const format = (iso: string) => dateFormat.format(new Date(`${iso}T00:00:00Z`));
  return window.earliest === window.latest
    ? format(window.earliest)
    : `${format(window.earliest)} – ${format(window.latest)}`;
}
