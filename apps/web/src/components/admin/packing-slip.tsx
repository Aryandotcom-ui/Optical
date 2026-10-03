'use client';

import { brand } from '@optical/config/brand';
import { useEffect, useState } from 'react';
import { Wordmark } from '@/components/brand/wordmark';
import { Button } from '@/components/ui/button';
import { adminGet, formatDate, humanise } from './admin-api';
import { addressLines, type AdminOrder } from './order-detail';

/** A printable packing slip: what is in the box, where it goes. No prices. */
export function PackingSlip({ id }: { id: string }) {
  const [order, setOrder] = useState<AdminOrder | null>(null);
  useEffect(() => {
    adminGet<AdminOrder>(`/orders/${id}`).then(setOrder, () => undefined);
  }, [id]);
  if (!order) return <p aria-live="polite">Loading…</p>;
  return (
    <article className="mx-auto max-w-2xl space-y-6 bg-background p-6 print:p-0">
      <div className="flex items-center justify-between print:hidden">
        <p className="text-caption text-ink-secondary">Prints on one A4 page.</p>
        <Button
          onClick={() => {
            window.print();
          }}
        >
          Print
        </Button>
      </div>
      <header className="flex items-start justify-between gap-4 border-b border-hairline pb-4">
        <Wordmark className="h-6 w-auto" />
        <div className="text-right text-caption">
          <p className="text-title font-semibold">Packing slip</p>
          <p>Order {order.number}</p>
          <p>{formatDate(order.placedAt)}</p>
        </div>
      </header>
      <section className="grid gap-6 sm:grid-cols-2">
        <div>
          <h2 className="text-caption font-medium text-ink-secondary">Ship to</h2>
          <address className="mt-1 not-italic">
            {addressLines(order.shippingAddress).map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </address>
        </div>
        <div className="text-caption">
          <h2 className="font-medium text-ink-secondary">Delivery</h2>
          <p className="mt-1">{humanise(order.shippingSpeed)}</p>
          {order.carrier ? (
            <p>
              {order.carrier} · {order.trackingNumber}
            </p>
          ) : null}
          {order.paymentProvider === 'COD' ? (
            <p className="mt-2 font-semibold">Cash on delivery: collect payment</p>
          ) : null}
        </div>
      </section>
      <table className="w-full text-left">
        <thead className="border-b border-hairline text-caption text-ink-secondary">
          <tr>
            <th scope="col" className="py-2">
              Item
            </th>
            <th scope="col" className="py-2">
              SKU
            </th>
            <th scope="col" className="py-2 text-right">
              Qty
            </th>
            <th scope="col" className="py-2 text-right">
              Packed
            </th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item) => (
            <tr key={item.id} className="border-b border-hairline">
              <td className="py-2">
                {item.productName}, {item.colourName}
                {item.lensConfig ? (
                  <span className="block text-caption text-ink-secondary">
                    With {humanise(item.lensConfig.purpose ?? 'prescription')} lenses
                  </span>
                ) : null}
              </td>
              <td className="py-2 text-caption">{item.sku}</td>
              <td className="tabular py-2 text-right">{item.quantity}</td>
              <td className="py-2 text-right">
                <span aria-hidden="true" className="inline-block size-4 border border-ink" />
                <span className="sr-only">Tick when packed</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <footer className="text-caption text-ink-secondary">
        Thank you for shopping with {brand.name}. Returns are free within the return window; start
        one from your order page.
      </footer>
    </article>
  );
}
