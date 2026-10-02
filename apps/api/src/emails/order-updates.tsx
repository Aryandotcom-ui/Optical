import { Text } from '@react-email/components';
import { EmailButton, EmailLayout, text } from './layout';
import { money } from './order-email';

export interface OrderCancelledData {
  number: string;
  customerName: string;
  orderUrl: string;
  /** Amount going back to the customer, or 0 when nothing was paid. */
  refundMinor: number;
}

/** Sent when the customer cancels an order. */
export function OrderCancelledEmail({ data }: { data: OrderCancelledData }) {
  return (
    <EmailLayout preview={`Order ${data.number} is cancelled.`}>
      <Text style={text.heading}>Order {data.number} is cancelled</Text>
      <Text style={text.body}>
        Hi {data.customerName}, we have cancelled your order as you asked. Nothing will be made or
        sent.
      </Text>
      <Text style={text.body}>
        {data.refundMinor > 0
          ? `We are refunding ${money(data.refundMinor)} to the way you paid. Banks usually show it within 5–7 working days.`
          : 'You were not charged for this order.'}
      </Text>
      <EmailButton href={data.orderUrl}>View the order</EmailButton>
    </EmailLayout>
  );
}

export type ReturnStage = 'requested' | 'received' | 'refunded' | 'declined';

export interface ReturnUpdateData {
  number: string;
  customerName: string;
  orderUrl: string;
  stage: ReturnStage;
  refundMinor: number | null;
}

const returnCopy: Record<
  ReturnStage,
  { heading: string; body: (data: ReturnUpdateData) => string }
> = {
  requested: {
    heading: 'We have your return request',
    body: (data) =>
      `We will email a free pickup slot for order ${data.number} within one working day. Pack the frames in their case; you can keep the box.`,
  },
  received: {
    heading: 'Your return has arrived',
    body: (data) =>
      `The frames from order ${data.number} are back with us. We check them within two working days, then refund you.`,
  },
  refunded: {
    heading: 'Your refund is on its way',
    body: (data) =>
      `We have refunded ${data.refundMinor === null ? 'your order' : money(data.refundMinor)} for order ${data.number}. Banks usually show it within 5–7 working days.`,
  },
  declined: {
    heading: 'About your return',
    body: (data) =>
      `We could not accept the return for order ${data.number}. Reply to this email and we will explain and find a fix.`,
  },
};

/** Every step of a return: requested, received, refunded (or declined). */
export function ReturnUpdateEmail({ data }: { data: ReturnUpdateData }) {
  const copy = returnCopy[data.stage];
  return (
    <EmailLayout preview={`${copy.heading}: order ${data.number}.`}>
      <Text style={text.heading}>{copy.heading}</Text>
      <Text style={text.body}>Hi {data.customerName},</Text>
      <Text style={text.body}>{copy.body(data)}</Text>
      <EmailButton href={data.orderUrl}>View the order</EmailButton>
    </EmailLayout>
  );
}
