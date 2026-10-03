'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { formatPrice } from '@/lib/format';
import { adminGet, adminSend, formatDateTime, humanise } from './admin-api';
import { useCanWrite } from './admin-context';
import {
  Check,
  Field,
  PageHeader,
  Panel,
  Select,
  StatusBadge,
  TextArea,
  toMinor,
  useAction,
} from './ui';

export interface AdminOrder {
  id: string;
  number: string;
  status: string;
  email: string;
  phone: string | null;
  placedAt: string;
  paymentProvider: string;
  awaitingPrescription: boolean;
  subtotalMinor: number;
  discountMinor: number;
  shippingMinor: number;
  codFeeMinor: number;
  taxMinor: number;
  totalMinor: number;
  couponCode: string | null;
  shippingSpeed: string;
  shippingAddress: {
    fullName?: string;
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    phone?: string;
  };
  customerNote: string | null;
  internalNote: string | null;
  carrier: string | null;
  trackingNumber: string | null;
  nextStatuses: string[];
  items: {
    id: string;
    sku: string;
    productName: string;
    colourName: string;
    quantity: number;
    totalMinor: number;
    lensConfig: { purpose?: string; indexCode?: string; packageCode?: string } | null;
    prescription: { id: string; status: string; fileUrl: string | null } | null;
  }[];
  events: {
    id: string;
    fromStatus: string | null;
    toStatus: string;
    note: string | null;
    visibleToCustomer: boolean;
    createdAt: string;
  }[];
  payments: { id: string; status: string; amountMinor: number; providerRef: string | null }[];
  refunds: { id: string; status: string; amountMinor: number; reason: string; createdAt: string }[];
  user: { id: string; name: string } | null;
}

export function addressLines(address: AdminOrder['shippingAddress']) {
  return [
    address.fullName,
    address.line1,
    address.line2,
    [address.city, address.state, address.postalCode].filter(Boolean).join(', '),
    address.phone,
  ].filter(Boolean);
}

export function OrderDetail({ id }: { id: string }) {
  const [order, setOrder] = useState<AdminOrder | null>(null);
  const [failed, setFailed] = useState(false);
  const canWrite = useCanWrite('orders');
  const move = useAction();
  const save = useAction();
  const refund = useAction();
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  const [tell, setTell] = useState(true);
  const [shipping, setShipping] = useState({ carrier: '', trackingNumber: '', internalNote: '' });
  const [refundForm, setRefundForm] = useState({ amount: '', reason: '' });

  const apply = (next: AdminOrder) => {
    setOrder(next);
    setTo(next.nextStatuses[0] ?? '');
    setShipping({
      carrier: next.carrier ?? '',
      trackingNumber: next.trackingNumber ?? '',
      internalNote: next.internalNote ?? '',
    });
  };

  useEffect(() => {
    adminGet<AdminOrder>(`/orders/${id}`).then(apply, () => {
      setFailed(true);
    });
  }, [id]);

  if (failed) return <p role="alert">This order couldn’t be loaded.</p>;
  if (!order) return <p aria-live="polite">Loading…</p>;
  const paid = order.payments.find(
    (payment) => payment.status === 'SUCCEEDED' || payment.status === 'REFUNDED',
  );

  return (
    <>
      <PageHeader
        title={`Order ${order.number}`}
        description={`Placed ${formatDateTime(order.placedAt)} · ${humanise(order.paymentProvider)} · ${humanise(order.shippingSpeed)} delivery`}
        actions={
          <>
            <StatusBadge value={order.status} />
            <Button asChild variant="secondary">
              <Link href={`/admin/orders/${order.id}/packing-slip` as Route}>Packing slip</Link>
            </Button>
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <Panel title="Items">
            <ul className="divide-y divide-hairline">
              {order.items.map((item) => (
                <li key={item.id} className="flex flex-wrap justify-between gap-3 py-3">
                  <div>
                    <p className="font-medium">
                      {item.quantity} × {item.productName}, {item.colourName}
                    </p>
                    <p className="text-caption text-ink-secondary">
                      {item.sku}
                      {item.lensConfig
                        ? ` · ${humanise(item.lensConfig.purpose ?? 'lenses')} lenses, ${item.lensConfig.indexCode ?? ''} ${item.lensConfig.packageCode ?? ''}`
                        : ' · frame only'}
                    </p>
                    {item.prescription ? (
                      <p className="mt-1 flex items-center gap-2 text-caption">
                        <StatusBadge value={item.prescription.status} />
                        <Link
                          href={`/admin/prescriptions/${item.prescription.id}` as Route}
                          className="text-accent hover:underline"
                        >
                          Review prescription
                        </Link>
                      </p>
                    ) : item.lensConfig ? (
                      <p className="mt-1 text-caption text-warning-ink">No prescription yet.</p>
                    ) : null}
                  </div>
                  <p className="tabular">{formatPrice(item.totalMinor)}</p>
                </li>
              ))}
            </ul>
            <dl className="tabular mt-3 space-y-1 border-t border-hairline pt-3 text-caption">
              {[
                ['Subtotal', order.subtotalMinor],
                [
                  `Discount${order.couponCode ? ` (${order.couponCode})` : ''}`,
                  -order.discountMinor,
                ],
                ['Delivery', order.shippingMinor],
                ['Cash on delivery fee', order.codFeeMinor],
                ['Tax included', order.taxMinor],
              ]
                .filter(([, value]) => value !== 0)
                .map(([label, value]) => (
                  <div key={label} className="flex justify-between">
                    <dt>{label}</dt>
                    <dd>{formatPrice(Number(value))}</dd>
                  </div>
                ))}
              <div className="flex justify-between font-semibold">
                <dt>Total</dt>
                <dd>{formatPrice(order.totalMinor)}</dd>
              </div>
            </dl>
          </Panel>

          <Panel title="Timeline">
            <ol className="space-y-3">
              {order.events.map((event) => (
                <li key={event.id} className="text-caption">
                  <p className="font-medium">
                    {event.fromStatus && event.fromStatus !== event.toStatus
                      ? `${humanise(event.fromStatus)} → `
                      : ''}
                    {humanise(event.toStatus)}
                    {event.visibleToCustomer ? '' : ' (team only)'}
                  </p>
                  <p className="text-ink-secondary">
                    {formatDateTime(event.createdAt)}
                    {event.note ? ` · ${event.note}` : ''}
                  </p>
                </li>
              ))}
            </ol>
          </Panel>

          {paid ? (
            <Panel title="Payments and refunds">
              <p className="text-caption">
                Paid {formatPrice(paid.amountMinor)} ({humanise(paid.status)}) · ref{' '}
                {paid.providerRef ?? '—'}
              </p>
              <ul className="mt-2 space-y-1 text-caption">
                {order.refunds.map((entry) => (
                  <li key={entry.id}>
                    Refund {formatPrice(entry.amountMinor)} · {humanise(entry.status)} ·{' '}
                    {entry.reason} · {formatDateTime(entry.createdAt)}
                  </li>
                ))}
              </ul>
              {canWrite ? (
                <form
                  className="mt-4 grid gap-3 sm:grid-cols-[10rem_1fr_auto] sm:items-end"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void refund
                      .run(
                        () =>
                          adminSend<AdminOrder>('POST', `/orders/${order.id}/refund`, {
                            amountMinor: toMinor(refundForm.amount),
                            reason: refundForm.reason,
                          }),
                        'Refund sent.',
                      )
                      .then((next) => {
                        if (next) {
                          apply(next);
                          setRefundForm({ amount: '', reason: '' });
                        }
                      });
                  }}
                >
                  <Field
                    label="Amount (₹)"
                    type="number"
                    min="1"
                    step="0.01"
                    required
                    value={refundForm.amount}
                    onChange={(event) => {
                      setRefundForm({ ...refundForm, amount: event.target.value });
                    }}
                  />
                  <Field
                    label="Reason"
                    required
                    maxLength={300}
                    value={refundForm.reason}
                    onChange={(event) => {
                      setRefundForm({ ...refundForm, reason: event.target.value });
                    }}
                  />
                  <Button type="submit" variant="secondary" disabled={refund.busy}>
                    Refund
                  </Button>
                </form>
              ) : null}
              {refund.status}
            </Panel>
          ) : null}
        </div>

        <div className="space-y-6">
          <Panel title="Customer">
            <address className="text-caption not-italic">
              {addressLines(order.shippingAddress).map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
              <span className="mt-2 block">{order.email}</span>
            </address>
            {order.user ? (
              <Link
                href={`/admin/customers/${order.user.id}` as Route}
                className="mt-2 inline-block text-caption text-accent hover:underline"
              >
                Customer account
              </Link>
            ) : (
              <p className="mt-2 text-caption text-ink-secondary">Guest checkout</p>
            )}
            {order.customerNote ? (
              <p className="mt-2 text-caption">Note from customer: {order.customerNote}</p>
            ) : null}
          </Panel>

          {canWrite && order.nextStatuses.length > 0 ? (
            <Panel title="Change status">
              <form
                className="space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void move
                    .run(
                      () =>
                        adminSend<AdminOrder>('POST', `/orders/${order.id}/transition`, {
                          to,
                          note: note || undefined,
                          visibleToCustomer: tell,
                        }),
                      'Status changed.',
                    )
                    .then((next) => {
                      if (next) {
                        apply(next);
                        setNote('');
                      }
                    });
                }}
              >
                <Select
                  label="Move to"
                  value={to}
                  onChange={(event) => {
                    setTo(event.target.value);
                  }}
                  options={order.nextStatuses.map((status) => ({
                    value: status,
                    label: humanise(status),
                  }))}
                />
                <TextArea
                  label="Note (optional)"
                  maxLength={500}
                  value={note}
                  onChange={(event) => {
                    setNote(event.target.value);
                  }}
                />
                <Check
                  label="Show on the customer’s timeline"
                  checked={tell}
                  onChange={(event) => {
                    setTell(event.target.checked);
                  }}
                />
                <Button type="submit" disabled={move.busy}>
                  Update status
                </Button>
                {move.status}
              </form>
            </Panel>
          ) : null}

          <Panel title="Shipment and notes">
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                void save
                  .run(() =>
                    adminSend<AdminOrder>('PATCH', `/orders/${order.id}`, {
                      carrier: shipping.carrier || null,
                      trackingNumber: shipping.trackingNumber || null,
                      internalNote: shipping.internalNote || null,
                    }),
                  )
                  .then((next) => {
                    if (next) apply(next);
                  });
              }}
            >
              <Field
                label="Carrier"
                disabled={!canWrite}
                value={shipping.carrier}
                onChange={(event) => {
                  setShipping({ ...shipping, carrier: event.target.value });
                }}
              />
              <Field
                label="Tracking number"
                disabled={!canWrite}
                value={shipping.trackingNumber}
                onChange={(event) => {
                  setShipping({ ...shipping, trackingNumber: event.target.value });
                }}
              />
              <TextArea
                label="Team notes (never shown to the customer)"
                disabled={!canWrite}
                maxLength={2000}
                value={shipping.internalNote}
                onChange={(event) => {
                  setShipping({ ...shipping, internalNote: event.target.value });
                }}
              />
              {canWrite ? (
                <Button type="submit" variant="secondary" disabled={save.busy}>
                  Save
                </Button>
              ) : null}
              {save.status}
            </form>
          </Panel>
        </div>
      </div>
    </>
  );
}
