import { brand } from '@optical/config/brand';
import { commerce } from '@optical/config/commerce';
import { LEGAL_UPDATED, type LegalDocument } from './types';

export function termsOfUse(): LegalDocument {
  return {
    slug: 'terms',
    title: 'Terms of use',
    summary: `The terms that apply when you use this site and buy from ${brand.name}.`,
    updated: LEGAL_UPDATED,
    sections: [
      {
        heading: 'About these terms',
        paragraphs: [
          `This site is run by ${brand.legalName}. By using it or placing an order you agree to these terms. Our privacy, returns and shipping policies form part of them.`,
        ],
      },
      {
        heading: 'Prescriptions',
        paragraphs: [
          'When you order prescription lenses, you confirm that the prescription is yours (or that of the person you are ordering for, with their permission), was issued by a qualified eye-care professional, and is current. We check every prescription for values we can make and may contact you if something looks unusual, but we do not examine eyes and cannot confirm that a prescription is right for you.',
        ],
      },
      {
        heading: 'Prices and product information',
        paragraphs: [
          `Prices are in ${commerce.currency} and include ${commerce.tax.name}. Delivery fees are shown before you pay. Product photos are computer-generated from each frame's real measurements; colours on screen can differ slightly from the finished frame.`,
          'If we list something at an obviously wrong price, we will tell you before dispatch and you can cancel for a full refund.',
        ],
      },
      {
        heading: 'Orders',
        paragraphs: [
          'Your order is accepted when we email you a confirmation. We may decline or cancel an order, for example if an item turns out to be out of stock or a prescription cannot be made; if we do, we refund you in full.',
          'You can cancel free of charge until a frame is dispatched or, for prescription orders, until lens production starts.',
        ],
      },
      {
        heading: 'Payment',
        paragraphs: [
          'Payments are processed by our payment provider. Cash on delivery is available for eligible orders, as shown at checkout.',
        ],
      },
      {
        heading: 'Delivery, returns and warranty',
        paragraphs: [
          `Delivery is covered in our shipping policy. You can return an order within ${commerce.policies.returnWindowDays} days of delivery, and every frame has a ${commerce.policies.frameWarrantyMonths}-month warranty against manufacturing faults; see our returns policy. These do not limit your rights under the Consumer Protection Act, 2019.`,
        ],
      },
      {
        heading: 'Using this site',
        paragraphs: [
          'Please do not misuse the site: no attempts to break its security, scrape it at volume, or use it for anything unlawful. Reviews you post must be honest and about your own experience; we may remove ones that are not.',
        ],
      },
      {
        heading: 'Liability',
        paragraphs: [
          'We are responsible for losses that are a foreseeable result of our breaking these terms or our negligence. We are not responsible for losses that were not foreseeable, or for business losses. Nothing here limits liability that cannot be limited by law.',
        ],
      },
      {
        heading: 'Law and disputes',
        paragraphs: [
          `These terms are governed by the laws of India. If you have a complaint, please contact us first at ${brand.supportEmail} so we can try to put it right. Disputes are subject to the courts of Bengaluru, Karnataka, without affecting your right to approach a consumer commission.`,
        ],
      },
    ],
  };
}
