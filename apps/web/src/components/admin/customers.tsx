'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { formatPrice } from '@/lib/format';
import { adminGet, adminSend, formatDate } from './admin-api';
import { useAdmin, useCanWrite } from './admin-context';
import { DataTable } from './data-table';
import { PageHeader, Panel, Select, StatusBadge, useAction } from './ui';

interface CustomerRow {
  id: string;
  name: string;
  email: string;
  role: string;
  orders: number;
  spentMinor: number;
  createdAt: string;
}

export function CustomersList() {
  return (
    <>
      <PageHeader title="Customers" description="Accounts only; guest orders are under Orders." />
      <DataTable<CustomerRow>
        path="/customers"
        csvName="customers"
        searchLabel="Name or email"
        rowKey={(row) => row.id}
        rowLink={(row) => `/admin/customers/${row.id}`}
        columns={[
          {
            key: 'name',
            label: 'Name',
            sort: 'name',
            render: (row) => <span className="font-medium">{row.name}</span>,
          },
          { key: 'email', label: 'Email', sort: 'email', render: (row) => row.email },
          {
            key: 'role',
            label: 'Role',
            render: (row) =>
              row.role === 'CUSTOMER' ? 'Customer' : <StatusBadge value={row.role} />,
          },
          {
            key: 'orders',
            label: 'Orders',
            render: (row) => row.orders,
            className: 'tabular text-right',
          },
          {
            key: 'spent',
            label: 'Spent',
            render: (row) => formatPrice(row.spentMinor),
            className: 'tabular text-right',
          },
          {
            key: 'joined',
            label: 'Joined',
            sort: 'createdAt',
            render: (row) => formatDate(row.createdAt),
          },
        ]}
      />
    </>
  );
}

interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  marketingOptIn: boolean;
  createdAt: string;
  orders: { id: string; number: string; status: string; totalMinor: number; placedAt: string }[];
  _count: { addresses: number };
}

export function CustomerDetail({ id }: { id: string }) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [role, setRole] = useState('CUSTOMER');
  const me = useAdmin();
  const canChangeRole = useCanWrite('settings');
  const action = useAction();
  useEffect(() => {
    adminGet<Customer>(`/customers/${id}`).then(
      (next) => {
        setCustomer(next);
        setRole(next.role);
      },
      () => undefined,
    );
  }, [id]);
  if (!customer) return <p aria-live="polite">Loading…</p>;
  return (
    <>
      <PageHeader
        title={customer.name}
        description={`${customer.email}${customer.phone ? ` · ${customer.phone}` : ''} · joined ${formatDate(customer.createdAt)}`}
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <Panel title="Orders">
          {customer.orders.length === 0 ? (
            <p className="text-ink-secondary">No orders yet.</p>
          ) : null}
          <ul className="divide-y divide-hairline">
            {customer.orders.map((order) => (
              <li key={order.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                <Link
                  href={`/admin/orders/${order.id}` as Route}
                  className="font-medium text-accent hover:underline"
                >
                  {order.number}
                </Link>
                <span className="text-caption">{formatDate(order.placedAt)}</span>
                <StatusBadge value={order.status} />
                <span className="tabular">{formatPrice(order.totalMinor)}</span>
              </li>
            ))}
          </ul>
        </Panel>
        <div className="space-y-6">
          <Panel title="Account">
            <p className="text-caption">{customer._count.addresses} saved addresses</p>
            <p className="text-caption">
              {customer.marketingOptIn ? 'Receives marketing email' : 'No marketing email'}
            </p>
          </Panel>
          {canChangeRole && customer.id !== me.id ? (
            <Panel title="Role">
              <form
                className="space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void action
                    .run(
                      () => adminSend<Customer>('PUT', `/customers/${customer.id}/role`, { role }),
                      'Role changed. They have been signed out everywhere.',
                    )
                    .then((next) => {
                      if (next) setCustomer(next);
                    });
                }}
              >
                <Select
                  label="Role"
                  value={role}
                  onChange={(event) => {
                    setRole(event.target.value);
                  }}
                  options={[
                    { value: 'CUSTOMER', label: 'Customer' },
                    { value: 'STAFF', label: 'Staff: orders, prescriptions, stock, reviews, help' },
                    { value: 'ADMIN', label: 'Admin: everything' },
                  ]}
                />
                <Button
                  type="submit"
                  variant="secondary"
                  disabled={action.busy || role === customer.role}
                >
                  Change role
                </Button>
                {action.status}
              </form>
            </Panel>
          ) : null}
        </div>
      </div>
    </>
  );
}
