import { brand } from '@optical/config/brand';
import { commerce } from '@optical/config/commerce';
import { LEGAL_UPDATED, type LegalDocument } from './types';

export function returnsPolicy(): LegalDocument {
  const { returnWindowDays: days, frameWarrantyMonths: months } = commerce.policies;
  return {
    slug: 'returns',
    title: 'Returns policy',
    summary: `Returns within ${days} days, a ${months}-month frame warranty, and how refunds work.`,
    updated: LEGAL_UPDATED,
    sections: [
      {
        heading: `${days}-day returns`,
        paragraphs: [
          `You can return any order within ${days} days of delivery for a full refund of the product price, including prescription lenses. You don't need to give a reason.`,
        ],
        list: [
          'Return the glasses in their original case, with any accessories that came with them.',
          'They should be unworn beyond trying them on, and undamaged.',
          'Gift cards and items marked as final sale, if we ever offer any, cannot be returned.',
        ],
      },
      {
        heading: 'How to return',
        paragraphs: [
          `Email ${brand.supportEmail} with your order number within ${days} days of delivery. We arrange a free pickup from your delivery address. Once your account is set up, you will be able to start returns from your order history.`,
        ],
      },
      {
        heading: 'Refunds',
        paragraphs: [
          'We refund within 5 to 7 working days of receiving and checking the return, to the original payment method. Cash-on-delivery orders are refunded to a UPI ID or bank account you provide. Delivery fees are refunded if you return the whole order.',
        ],
      },
      {
        heading: 'Damaged or wrong items',
        paragraphs: [
          'If your order arrives damaged, or is not what you ordered, tell us within 48 hours of delivery with a photo, and we will replace it or refund you in full, including delivery.',
        ],
      },
      {
        heading: `${months}-month warranty`,
        paragraphs: [
          `Every frame is covered for ${months} months from delivery against manufacturing faults, such as hinges that loosen or break, coatings that peel, or cracks without an impact. We repair or replace the frame free of charge, including shipping both ways.`,
          'The warranty does not cover accidental damage, normal wear such as lens scratches, or loss.',
        ],
      },
      {
        heading: 'Your legal rights',
        paragraphs: [
          'This policy is in addition to your rights under the Consumer Protection Act, 2019, and does not affect them.',
        ],
      },
    ],
  };
}
