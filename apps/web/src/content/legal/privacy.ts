import { brand } from '@optical/config/brand';
import { LEGAL_UPDATED, type LegalDocument } from './types';

export function privacyPolicy(): LegalDocument {
  return {
    slug: 'privacy',
    title: 'Privacy policy',
    summary: `How ${brand.name} collects, uses and protects your personal data, and the choices you have.`,
    updated: LEGAL_UPDATED,
    sections: [
      {
        heading: 'Who we are',
        paragraphs: [
          `${brand.legalName} ("we", "us") runs this store and is responsible for your personal data under India's Digital Personal Data Protection Act, 2023. You can reach us about anything in this policy at ${brand.supportEmail}.`,
        ],
      },
      {
        heading: 'What we collect',
        paragraphs: [
          'We collect only what we need to sell you glasses and look after you afterwards:',
        ],
        list: [
          'Contact details: your name, email address and phone number.',
          'Delivery details: the addresses you give us.',
          'Order details: what you bought, what you paid and how it was delivered.',
          'Prescription details: the values you enter or upload, and your pupillary distance. These are health data, so we treat them with extra care (see below).',
          'Messages: what you send our support team.',
          'Technical data: the pages you request and basic device information, kept in server logs for security.',
        ],
      },
      {
        heading: 'What stays on your device',
        paragraphs: [
          'Some features work entirely in your browser and send us nothing. Your guest wishlist, compare list, recent searches, the PIN code you check delivery for and the frame size you enter on product pages are stored only in your browser. Clearing your browser data removes them.',
          'Virtual try-on, when it launches, runs on your device. Camera images and face measurements are processed in your browser, never sent to us, and never stored.',
        ],
      },
      {
        heading: 'How we use your data',
        paragraphs: ['We use your data to:'],
        list: [
          'make and deliver your order, including surfacing lenses to your prescription;',
          'take payment and prevent fraud;',
          'answer your questions and handle returns and warranty claims;',
          'send service emails about your orders and account;',
          'send marketing emails, only if you opt in, with an unsubscribe link in every one;',
          'meet our legal and tax obligations.',
        ],
      },
      {
        heading: 'Prescriptions',
        paragraphs: [
          'Your prescription is used only to make your lenses and to answer questions about them. It is stored encrypted, visible only to the staff who need it, and never used for marketing or shared beyond the lab that makes your lenses.',
        ],
      },
      {
        heading: 'Who we share it with',
        paragraphs: [
          'We share the minimum needed with: the courier delivering your order; the payment provider processing your payment (we never see or store full card numbers); our lens lab; and service providers who host our systems and send our emails, under contracts that limit how they use it. We do not sell personal data.',
          'We may disclose data when the law requires it, for example in response to a valid order from a court or authority.',
        ],
      },
      {
        heading: 'Cookies',
        paragraphs: [
          'We use cookies that the store needs to work: to keep you signed in, protect forms against forgery, and remember dismissed notices. Analytics cookies, if we use them, are set only after you agree, and you can change your mind at any time.',
        ],
      },
      {
        heading: 'How long we keep it',
        paragraphs: [
          'We keep order and invoice records for eight years, as Indian tax law requires. We keep prescriptions for as long as your account is open so you can reorder, or delete them sooner on request. Server logs are kept for up to 90 days.',
        ],
      },
      {
        heading: 'Your rights',
        paragraphs: [
          `You can ask to see the personal data we hold about you, correct it, or erase it (subject to what we must keep by law). You can withdraw consent for marketing at any time. Email ${brand.supportEmail}; we reply within 30 days.`,
          'If you are not satisfied with our response, you can contact our grievance officer at the same address, and you may complain to the Data Protection Board of India.',
        ],
      },
      {
        heading: 'Children',
        paragraphs: [
          "Our kids' frames are bought by parents and guardians. We don't knowingly collect data from children directly; a child's prescription is provided and managed by the adult placing the order.",
        ],
      },
      {
        heading: 'Security',
        paragraphs: [
          'We use encryption in transit, hashed passwords, access controls and regular updates. No system is perfectly secure; if a breach affects your data, we will tell you and the authorities as the law requires.',
        ],
      },
      {
        heading: 'Changes',
        paragraphs: [
          'If we change this policy in a way that matters, we will tell you by email or on this site before the change takes effect.',
        ],
      },
    ],
  };
}
