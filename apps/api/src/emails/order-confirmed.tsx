import { Button, Column, Row, Section, Text } from '@react-email/components';
import { EmailLayout, colours, text } from './layout';
import { deliveryWindow, money, type OrderEmailData } from './order-email';

function TotalRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  const style = { ...text.body, margin: '0 0 6px', fontWeight: strong ? 600 : 400 };
  return (
    <Row>
      <Column>
        <Text style={style}>{label}</Text>
      </Column>
      <Column align="right">
        <Text style={style}>{value}</Text>
      </Column>
    </Row>
  );
}

/** Sent when a prepaid order is paid, or a cash-on-delivery order is placed. */
export function OrderConfirmedEmail({ data }: { data: OrderEmailData }) {
  const cod = data.paymentProvider === 'cod';
  return (
    <EmailLayout preview={`Order ${data.number} is confirmed.`}>
      <Text style={text.heading}>Thank you, {data.customerName}.</Text>
      <Text style={text.body}>
        Your order {data.number} is confirmed
        {cod ? '. You pay in cash when it arrives.' : ' and paid.'}
      </Text>
      {data.delivery ? (
        <Text style={text.body}>Estimated delivery: {deliveryWindow(data.delivery)}.</Text>
      ) : null}
      {data.awaitingPrescription ? (
        <Section
          style={{
            backgroundColor: colours.surface,
            borderRadius: '12px',
            padding: '16px',
            margin: '16px 0',
          }}
        >
          <Text style={{ ...text.body, fontWeight: 600 }}>We still need your prescription</Text>
          <Text style={text.small}>
            Your lenses are made once an optician has checked it. Upload a photo or enter the values
            from your order page.
          </Text>
        </Section>
      ) : null}
      <Section style={{ margin: '24px 0' }}>
        {data.items.map((item, index) => (
          <Section key={index} style={{ marginBottom: '12px' }}>
            <Row>
              <Column>
                <Text style={{ ...text.body, margin: 0, fontWeight: 600 }}>
                  {item.quantity > 1 ? `${item.quantity} × ` : ''}
                  {item.name}
                </Text>
                <Text style={{ ...text.small, margin: 0 }}>{item.colour}</Text>
                {item.lens.length > 0 ? (
                  <Text style={{ ...text.small, margin: 0 }}>{item.lens.join(' · ')}</Text>
                ) : null}
              </Column>
              <Column align="right" style={{ verticalAlign: 'top' }}>
                <Text style={{ ...text.body, margin: 0 }}>{money(item.totalMinor)}</Text>
              </Column>
            </Row>
          </Section>
        ))}
      </Section>
      <TotalRow label="Subtotal" value={money(data.totals.subtotalMinor)} />
      {data.totals.discountMinor > 0 ? (
        <TotalRow label="Discount" value={`−${money(data.totals.discountMinor)}`} />
      ) : null}
      <TotalRow
        label="Delivery"
        value={data.totals.shippingMinor > 0 ? money(data.totals.shippingMinor) : 'Free'}
      />
      {data.totals.codFeeMinor > 0 ? (
        <TotalRow label="Cash on delivery fee" value={money(data.totals.codFeeMinor)} />
      ) : null}
      <TotalRow label="Total" value={money(data.totals.totalMinor)} strong />
      <Text style={text.small}>
        Includes {data.totals.taxName} of {money(data.totals.taxMinor)}.
      </Text>
      <Text style={{ ...text.small, marginTop: '16px' }}>
        Delivering to {data.address.join(', ')}.
      </Text>
      <Button
        href={data.orderUrl}
        style={{
          backgroundColor: colours.accent,
          borderRadius: '999px',
          color: '#FFFFFF',
          fontSize: '15px',
          fontWeight: 600,
          marginTop: '16px',
          padding: '12px 24px',
        }}
      >
        {data.awaitingPrescription ? 'Add your prescription' : 'View your order'}
      </Button>
    </EmailLayout>
  );
}
