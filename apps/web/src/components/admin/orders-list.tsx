'use client';

import { orderStatuses } from '@optical/shared/orders';
import { formatPrice } from '@/lib/format';
import { formatDateTime, humanise } from './admin-api';
import { DataTable } from './data-table';
import { PageHeader, StatusBadge } from './ui';

interface OrderRow {
  id: string;
  number: string;
  email: string;
  customer: string;
  status: string;
  totalMinor: number;
  paymentProvider: string;
  awaitingPrescription: boolean;
  placedAt: string;
  items: number;
}

export function OrdersList() {
  return (
    <>
      <PageHeader
        title="Orders"
        description="Every status change follows the order state machine and is audited."
      />
      <DataTable<OrderRow>
        path="/orders"
        csvName="orders"
        searchLabel="Order number or email"
        rowKey={(row) => row.id}
        rowLink={(row) => `/admin/orders/${row.id}`}
        filters={[
          {
            name: 'status',
            label: 'Status',
            options: [
              { value: '', label: 'All' },
              ...orderStatuses.map((status) => ({ value: status, label: humanise(status) })),
            ],
          },
          {
            name: 'awaiting',
            label: 'Prescription',
            options: [
              { value: '', label: 'Any' },
              { value: 'true', label: 'Awaiting prescription' },
            ],
          },
        ]}
        columns={[
          {
            key: 'number',
            label: 'Order',
            sort: 'number',
            render: (row) => <span className="font-medium">{row.number}</span>,
          },
          {
            key: 'placedAt',
            label: 'Placed',
            sort: 'placedAt',
            render: (row) => formatDateTime(row.placedAt),
          },
          {
            key: 'customer',
            label: 'Customer',
            render: (row) => (
              <>
                <span className="block">{row.customer}</span>
                <span className="text-ink-secondary">{row.email}</span>
              </>
            ),
          },
          {
            key: 'status',
            label: 'Status',
            render: (row) => (
              <span className="flex flex-wrap gap-1">
                <StatusBadge value={row.status} />
                {row.awaitingPrescription ? <StatusBadge value="PRESCRIPTION_PENDING" /> : null}
              </span>
            ),
          },
          { key: 'items', label: 'Items', render: (row) => row.items, className: 'tabular' },
          {
            key: 'total',
            label: 'Total',
            sort: 'totalMinor',
            render: (row) => formatPrice(row.totalMinor),
            className: 'tabular text-right',
          },
          { key: 'payment', label: 'Payment', render: (row) => humanise(row.paymentProvider) },
        ]}
      />
    </>
  );
}
