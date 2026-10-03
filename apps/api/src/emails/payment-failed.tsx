import { Button, Text } from '@react-email/components';
import { EmailLayout, colours, text } from './layout';
import { money, type OrderEmailData } from './order-email';

/** Sent when a payment is declined; the order stays open for a retry while stock is held. */
export function PaymentFailedEmail({
  data,
  reason,
}: {
  data: OrderEmailData;
  reason: string | null;
}) {
  return (
    <EmailLayout preview={`Your payment for order ${data.number} did not go through.`}>
      <Text style={text.heading}>Your payment did not go through</Text>
      <Text style={text.body}>
        We could not take {money(data.totals.totalMinor)} for order {data.number}
        {reason ? `: ${reason}` : '.'} No money has left your account.
      </Text>
      <Text style={text.body}>
        Your frames are held for a few minutes. You can try again with the same or another payment
        method from your order page.
      </Text>
      <Button
        href={data.orderUrl}
        style={{
          backgroundColor: colours.accent,
          borderRadius: '999px',
          color: '#FFFFFF',
          fontSize: '15px',
          fontWeight: 600,
          padding: '12px 24px',
        }}
      >
        Try again
      </Button>
    </EmailLayout>
  );
}
