import { brand } from '@optical/config/brand';
import { commerce } from '@optical/config/commerce';
import PDFDocument from 'pdfkit';
import { lensSummary } from './orders.mapper';
import type { OrderRow } from './orders.repository';

/**
 * A tax invoice as a PDF. The built-in Helvetica has no rupee sign, so
 * amounts are written "INR 1,234.00". Generated on request from the order's
 * own snapshot, so it never changes when the catalogue does.
 */
const amountFormat = new Intl.NumberFormat(commerce.locale, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const money = (minor: number) =>
  `${commerce.currency} ${amountFormat.format(minor / commerce.minorUnitsPerMajor)}`;
const dateFormat = new Intl.DateTimeFormat(commerce.locale, {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: commerce.timeZone,
});

const PAYMENT_NAMES = {
  MOCK: 'Online (test payment)',
  RAZORPAY: 'Online (Razorpay)',
  STRIPE: 'Card (Stripe)',
  COD: 'Cash on delivery',
} as const;

interface Address {
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string;
  region: string;
  postalCode: string;
}

export function invoiceFileName(order: Pick<OrderRow, 'number'>): string {
  return `${brand.shortName.toLowerCase()}-invoice-${order.number}.pdf`;
}

export function renderInvoice(order: OrderRow): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 48,
    info: { Title: `Invoice ${order.number}`, Author: brand.legalName },
  });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    doc.on('error', reject);
  });

  const left = 48;
  const width = doc.page.width - 96;
  const right = left + width;
  const ink = '#1D1D1F';
  const muted = '#6E6E73';

  doc.fillColor(ink).font('Helvetica-Bold').fontSize(20).text(brand.name, left, 48);
  doc.font('Helvetica').fontSize(9).fillColor(muted).text(brand.legalName).text(brand.supportEmail);
  doc
    .font('Helvetica-Bold')
    .fontSize(14)
    .fillColor(ink)
    .text('Tax invoice', left, 48, { width, align: 'right' });
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(muted)
    .text(`Order ${order.number}`, { width, align: 'right' })
    .text(`Date ${dateFormat.format(order.placedAt)}`, { width, align: 'right' });

  const address = order.shippingAddress as unknown as Address;
  doc.moveDown(2);
  const addressTop = Math.max(doc.y, 120);
  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .fillColor(muted)
    .text('BILLED AND SHIPPED TO', left, addressTop);
  doc.font('Helvetica').fontSize(10).fillColor(ink);
  for (const line of [
    address.fullName,
    address.line1,
    address.line2,
    address.landmark,
    `${address.city}, ${address.region} ${address.postalCode}`,
    address.phone,
    order.email,
  ])
    if (line) doc.text(line);

  // Items
  let y = doc.y + 24;
  const qtyX = right - 150;
  const amountX = right - 100;
  const header = (top: number) => {
    doc.font('Helvetica-Bold').fontSize(9).fillColor(muted);
    doc.text('ITEM', left, top);
    doc.text('QTY', qtyX, top, { width: 40, align: 'right' });
    doc.text('AMOUNT', amountX, top, { width: 100, align: 'right' });
    doc
      .moveTo(left, top + 14)
      .lineTo(right, top + 14)
      .strokeColor('#E5E5EA')
      .stroke();
    return top + 22;
  };
  y = header(y);
  for (const item of order.items) {
    const details = [item.colourName, ...lensSummary(item.priceLines)].join(' · ');
    const rowHeight =
      doc.heightOfString(item.productName, { width: qtyX - left - 12 }) +
      doc.heightOfString(details, { width: qtyX - left - 12 }) +
      12;
    if (y + rowHeight > doc.page.height - 160) {
      doc.addPage();
      y = header(48);
    }
    doc.font('Helvetica-Bold').fontSize(10).fillColor(ink);
    doc.text(item.productName, left, y, { width: qtyX - left - 12 });
    doc.font('Helvetica').fontSize(9).fillColor(muted);
    doc.text(details, { width: qtyX - left - 12 });
    doc.font('Helvetica').fontSize(10).fillColor(ink);
    doc.text(String(item.quantity), qtyX, y, { width: 40, align: 'right' });
    doc.text(money(item.totalMinor), amountX, y, { width: 100, align: 'right' });
    y += rowHeight;
  }

  // Totals
  doc.moveTo(left, y).lineTo(right, y).strokeColor('#E5E5EA').stroke();
  y += 10;
  const total = (label: string, value: string, strong = false) => {
    doc
      .font(strong ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(strong ? 11 : 10)
      .fillColor(ink);
    doc.text(label, right - 260, y, { width: 150 });
    doc.text(value, amountX - 50, y, { width: 150, align: 'right' });
    y += strong ? 18 : 15;
  };
  total('Subtotal', money(order.subtotalMinor));
  if (order.discountMinor > 0)
    total(
      order.couponCode ? `Discount (${order.couponCode})` : 'Discount',
      `- ${money(order.discountMinor)}`,
    );
  total('Delivery', order.shippingMinor > 0 ? money(order.shippingMinor) : 'Free');
  if (order.codFeeMinor > 0) total('Cash on delivery fee', money(order.codFeeMinor));
  total('Total', money(order.totalMinor), true);

  const rate = commerce.tax.rateBasisPoints / 100;
  doc.font('Helvetica').fontSize(9).fillColor(muted);
  doc.text(
    `Prices include ${commerce.tax.name} at ${rate}%: taxable value ${money(order.totalMinor - order.taxMinor)}, ${commerce.tax.name} ${money(order.taxMinor)}.`,
    left,
    y + 12,
    { width },
  );
  doc.text(`Paid by: ${PAYMENT_NAMES[order.paymentProvider]}.`, { width });
  doc.moveDown();
  doc.text('This invoice was generated electronically and needs no signature.', { width });

  doc.end();
  return finished;
}
