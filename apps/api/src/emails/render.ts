import { brand } from '@optical/config/brand';
import { render, toPlainText } from '@react-email/components';
import { createElement } from 'react';
import {
  AccountDeletedEmail,
  PasswordChangedEmail,
  PasswordResetEmail,
  PrescriptionExpiringEmail,
  WelcomeEmail,
  type PasswordChangedData,
  type PasswordResetData,
  type PrescriptionExpiringData,
  type WelcomeData,
} from './account-emails';
import { OrderConfirmedEmail } from './order-confirmed';
import type { OrderEmailData } from './order-email';
import { PaymentFailedEmail } from './payment-failed';
import {
  OrderCancelledEmail,
  PrescriptionUpdateEmail,
  ReturnUpdateEmail,
  type OrderCancelledData,
  type PrescriptionUpdateData,
  type ReturnUpdateData,
} from './order-updates';

/** Every email the API sends, with the data each needs. Stored as-is in the outbox. */
export type EmailMessage =
  | { template: 'order-confirmed'; data: OrderEmailData }
  | { template: 'payment-failed'; data: OrderEmailData; reason: string | null }
  | { template: 'order-cancelled'; data: OrderCancelledData }
  | { template: 'return-update'; data: ReturnUpdateData }
  | { template: 'prescription-update'; data: PrescriptionUpdateData }
  | { template: 'welcome'; data: WelcomeData }
  | { template: 'password-reset'; data: PasswordResetData }
  | { template: 'password-changed'; data: PasswordChangedData }
  | { template: 'prescription-expiring'; data: PrescriptionExpiringData }
  | { template: 'account-deleted'; data: { name: string } };

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
    case 'order-cancelled':
      subject = `Order ${message.data.number} is cancelled`;
      element = createElement(OrderCancelledEmail, { data: message.data });
      break;
    case 'return-update':
      subject = `Return for order ${message.data.number}: ${message.data.stage}`;
      element = createElement(ReturnUpdateEmail, { data: message.data });
      break;
    case 'prescription-update':
      subject = message.data.approved
        ? `Prescription checked for order ${message.data.number}`
        : `Action needed: prescription for order ${message.data.number}`;
      element = createElement(PrescriptionUpdateEmail, { data: message.data });
      break;
    case 'welcome':
      subject = `Welcome to ${brand.name}`;
      element = createElement(WelcomeEmail, { data: message.data });
      break;
    case 'password-reset':
      subject = 'Reset your password';
      element = createElement(PasswordResetEmail, { data: message.data });
      break;
    case 'password-changed':
      subject = 'Your password was changed';
      element = createElement(PasswordChangedEmail, { data: message.data });
      break;
    case 'prescription-expiring':
      subject = message.data.expired
        ? 'Your saved prescription has expired'
        : 'Your saved prescription expires soon';
      element = createElement(PrescriptionExpiringEmail, { data: message.data });
      break;
    case 'account-deleted':
      subject = `Your ${brand.name} account is deleted`;
      element = createElement(AccountDeletedEmail, { data: message.data });
      break;
  }
  const html = await render(element);
  return { subject, html, text: toPlainText(html) };
}
