import { commerce } from '@optical/config/commerce';
import { formatPrice } from '@/lib/format';
import { LEGAL_UPDATED, type LegalDocument } from './types';

export function shippingPolicy(): LegalDocument {
  const { shipping, policies, cashOnDelivery } = commerce;
  const remote = shipping.zones.find((zone) => zone.surchargeMinor > 0);
  const metro = shipping.zones.find((zone) => zone.extraTransitDays < 0);
  return {
    slug: 'shipping',
    title: 'Shipping policy',
    summary: 'Where we deliver, how long it takes and what it costs.',
    updated: LEGAL_UPDATED,
    sections: [
      {
        heading: 'Where we deliver',
        paragraphs: [
          'We deliver to addresses across India with a valid 6-digit PIN code. You can check delivery dates for your PIN code on any product page.',
        ],
      },
      {
        heading: 'Costs',
        paragraphs: [
          `Standard delivery is free on orders of ${formatPrice(shipping.freeShippingThresholdMinor)} or more after discounts; below that it costs ${formatPrice(shipping.standardFeeMinor)}. Express delivery costs ${formatPrice(shipping.expressFeeMinor)}.`,
          ...(remote
            ? [
                `Deliveries to remote areas (${remote.name.toLowerCase()}: Jammu & Kashmir, Ladakh, the North East and the Andaman & Nicobar Islands) carry a ${formatPrice(remote.surchargeMinor)} surcharge and take about ${remote.extraTransitDays} days longer.`,
              ]
            : []),
        ],
      },
      {
        heading: 'How long it takes',
        paragraphs: [
          `Frames without prescription lenses are dispatched within ${policies.dispatchDaysFrameOnly} working days. Prescription lenses are made to order and dispatched within ${policies.dispatchDaysPrescription} working days of your prescription being confirmed.`,
          `Standard delivery then takes about ${shipping.transitDays.standard} working days and express about ${shipping.transitDays.express}${metro ? `; ${metro.name.toLowerCase()} are usually a day faster` : ''}. Sundays and public holidays are not working days. Every estimate we show is a range, not a promise to the day.`,
        ],
      },
      {
        heading: 'Cash on delivery',
        paragraphs: [
          cashOnDelivery.enabled
            ? `Cash on delivery is available for orders up to ${formatPrice(cashOnDelivery.maxOrderTotalMinor)}, with a ${formatPrice(cashOnDelivery.feeMinor)} handling fee.`
            : 'Cash on delivery is not currently available.',
        ],
      },
      {
        heading: 'Tracking and delivery',
        paragraphs: [
          'We email a tracking link when your order is dispatched. If nobody is available, the courier tries again; after three attempts the parcel comes back to us and we contact you to rearrange delivery or refund you.',
        ],
      },
    ],
  };
}
