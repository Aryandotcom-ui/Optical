'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatPrice } from '@/lib/format';
import { adminGet, humanise } from './admin-api';
import { PageHeader, Panel } from './ui';

interface DashboardData {
  days: number;
  revenueMinor: number;
  orders: number;
  averageOrderMinor: number;
  conversion: { carts: number; placed: number; rate: number };
  topProducts: { productId: string; name: string; units: number; revenueMinor: number }[];
  statusCounts: Record<string, number>;
  awaitingPrescription: number;
  lowStock: {
    variantId: string;
    sku: string;
    product: string;
    colour: string;
    available: number;
    threshold: number;
  }[];
}

const RANGES = [7, 30, 90, 365];

export function Dashboard() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<DashboardData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let current = true;
    adminGet<DashboardData>(`/dashboard?days=${days}`).then(
      (result) => {
        if (!current) return;
        setData(result);
        setFailed(false);
      },
      () => {
        if (current) setFailed(true);
      },
    );
    return () => {
      current = false;
    };
  }, [days]);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Sales exclude unpaid, cancelled and refunded orders."
        actions={
          <label className="text-caption font-medium">
            Period
            <select
              value={days}
              onChange={(event) => {
                setDays(Number(event.target.value));
              }}
              className="mt-1 block min-h-11 rounded-control bg-surface px-3 ring-1 ring-hairline ring-inset"
            >
              {RANGES.map((range) => (
                <option key={range} value={range}>
                  Last {range} days
                </option>
              ))}
            </select>
          </label>
        }
      />
      {failed ? <p role="alert">We couldn’t load the figures. Reload to try again.</p> : null}
      {data ? (
        <div className="space-y-6">
          <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ['Revenue', formatPrice(data.revenueMinor)],
              ['Orders', String(data.orders)],
              ['Average order', formatPrice(data.averageOrderMinor)],
              [
                'Bags that ordered',
                `${(data.conversion.rate * 100).toFixed(1)}% (${data.conversion.placed} of ${data.conversion.carts})`,
              ],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-card bg-surface p-5 ring-1 ring-hairline ring-inset"
              >
                <dt className="text-caption text-ink-secondary">{label}</dt>
                <dd className="tabular mt-1 text-title font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="grid gap-6 xl:grid-cols-3">
            <Panel title="Needs attention">
              <ul className="space-y-2">
                <li>
                  <Link href={'/admin/prescriptions'} className="text-accent hover:underline">
                    {data.awaitingPrescription} orders awaiting a prescription
                  </Link>
                </li>
                {Object.entries(data.statusCounts)
                  .filter(([status]) =>
                    ['PAID', 'IN_PRODUCTION', 'QUALITY_CHECK', 'RETURN_REQUESTED'].includes(status),
                  )
                  .map(([status, count]) => (
                    <li key={status}>
                      <Link
                        href={`/admin/orders?status=${status}` as Route}
                        className="text-accent hover:underline"
                      >
                        {count} {humanise(status).toLowerCase()}
                      </Link>
                    </li>
                  ))}
              </ul>
            </Panel>
            <Panel title="Top products">
              {data.topProducts.length === 0 ? (
                <p className="text-ink-secondary">No sales in this period.</p>
              ) : null}
              <ol className="space-y-2">
                {data.topProducts.map((product) => (
                  <li key={product.productId} className="flex justify-between gap-3">
                    <Link
                      href={`/admin/products/${product.productId}` as Route}
                      className="hover:underline"
                    >
                      {product.name}
                    </Link>
                    <span className="tabular text-ink-secondary">
                      {product.units} · {formatPrice(product.revenueMinor)}
                    </span>
                  </li>
                ))}
              </ol>
            </Panel>
            <Panel title="Low stock">
              {data.lowStock.length === 0 ? (
                <p className="text-ink-secondary">Everything is above its threshold.</p>
              ) : null}
              <ul className="space-y-2">
                {data.lowStock.map((item) => (
                  <li key={item.variantId} className="flex justify-between gap-3">
                    <span>
                      {item.product}, {item.colour}
                    </span>
                    <span className="tabular text-ink-secondary">
                      {item.available} left (min {item.threshold})
                    </span>
                  </li>
                ))}
              </ul>
              <Link
                href={'/admin/inventory?low=true'}
                className="mt-3 inline-block text-accent hover:underline"
              >
                Open inventory
              </Link>
            </Panel>
          </div>
        </div>
      ) : null}
    </>
  );
}
