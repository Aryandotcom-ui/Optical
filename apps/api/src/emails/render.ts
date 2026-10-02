import { render, toPlainText } from '@react-email/components';
import { createElement } from 'react';
import { OrderConfirmedEmail } from './order-confirmed';
import type { OrderEmailData } from './order-email';
import { PaymentFailedEmail } from './payment-failed';

/** Every email the API sends, with the data each needs. Stored as-is in the outbox. */
export type EmailMessage =
  | { template: 'order-confirmed'; data: OrderEmailData }
  | { template: 'payment-failed'; data: OrderEmailData; reason: string | null };

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export async function renderEmail(message: EmailMessage): Promise<RenderedEmail> {
  let subject: string;
  let element;
  switch (message.template) {
    case 'order-confirmed':
      subject = `Order ${message.data.number} confirmed`;
      element = createElement(OrderConfirmedEmail, { data: message.data });
      break;
    case 'payment-failed':
      subject = `Payment for order ${message.data.number} did not go through`;
      element = createElement(PaymentFailedEmail, { data: message.data, reason: message.reason });
      break;
  }
  const html = await render(element);
  return { subject, html, text: toPlainText(html) };
}
