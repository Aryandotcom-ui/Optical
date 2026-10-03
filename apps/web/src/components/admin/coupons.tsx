'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { formatPrice } from '@/lib/format';
import { adminSend, formatDate } from './admin-api';
import { useCanWrite } from './admin-context';
import { DataTable } from './data-table';
import { Check, Field, PageHeader, Panel, Select, StatusBadge, toMinor, useAction } from './ui';

interface Coupon {
  id: string;
  code: string;
  description: string;
  kind: string;
  percentBasisPoints: number | null;
  amountMinor: number | null;
  minSubtotalMinor: number;
  active: boolean;
  usageCount: number;
  usageLimit: number | null;
  endsAt: string | null;
}

const value = (coupon: Coupon) =>
  coupon.kind === 'percentage'
    ? `${(coupon.percentBasisPoints ?? 0) / 100}% off`
    : coupon.kind === 'fixed'
      ? `${formatPrice(coupon.amountMinor ?? 0)} off`
      : 'Free delivery';

export function Coupons() {
  const canWrite = useCanWrite('coupons');
  const [version, setVersion] = useState(0);
  const action = useAction();
  const blank = {
    code: '',
    description: '',
    kind: 'percentage',
    percent: '',
    amount: '',
    min: '',
    limit: '',
    endsAt: '',
    firstOrderOnly: false,
  };
  const [form, setForm] = useState(blank);
  const refresh = () => {
    setVersion((current) => current + 1);
  };
  return (
    <>
      <PageHeader
        title="Coupons"
        description="Codes are checked at checkout; first-order coupons need an email we haven’t seen before."
      />
      {canWrite ? (
        <Panel title="New coupon" className="mb-6">
          <form
            className="grid gap-3 sm:grid-cols-4 sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              void action
                .run(
                  () =>
                    adminSend('POST', '/coupons', {
                      code: form.code,
                      description: form.description,
                      kind: form.kind,
                      percentBasisPoints:
                        form.kind === 'percentage' ? Math.round(Number(form.percent) * 100) : null,
                      amountMinor: form.kind === 'fixed' ? toMinor(form.amount) : null,
                      minSubtotalMinor: form.min ? toMinor(form.min) : 0,
                      usageLimit: form.limit ? Number(form.limit) : null,
                      endsAt: form.endsAt
                        ? new Date(`${form.endsAt}T23:59:59`).toISOString()
                        : null,
                      firstOrderOnly: form.firstOrderOnly,
                    }),
                  'Coupon created.',
                )
                .then((created) => {
                  if (created) {
                    setForm(blank);
                    refresh();
                  }
                });
            }}
          >
            <Field
              label="Code"
              required
              pattern="[A-Za-z0-9]{3,20}"
              value={form.code}
              onChange={(event) => {
                setForm({ ...form, code: event.target.value.toUpperCase() });
              }}
            />
            <Field
              label="Description (shown to customers)"
              required
              className="sm:col-span-2"
              value={form.description}
              onChange={(event) => {
                setForm({ ...form, description: event.target.value });
              }}
            />
            <Select
              label="Kind"
              value={form.kind}
              onChange={(event) => {
                setForm({ ...form, kind: event.target.value });
              }}
              options={[
                { value: 'percentage', label: 'Percentage' },
                { value: 'fixed', label: 'Fixed amount' },
                { value: 'free-shipping', label: 'Free delivery' },
              ]}
            />
            {form.kind === 'percentage' ? (
              <Field
                label="Percent off"
                type="number"
                min="1"
                max="100"
                required
                value={form.percent}
                onChange={(event) => {
                  setForm({ ...form, percent: event.target.value });
                }}
              />
            ) : null}
            {form.kind === 'fixed' ? (
              <Field
                label="Amount off (₹)"
                type="number"
                min="1"
                required
                value={form.amount}
                onChange={(event) => {
                  setForm({ ...form, amount: event.target.value });
                }}
              />
            ) : null}
            <Field
              label="Minimum order (₹)"
              type="number"
              min="0"
              value={form.min}
              onChange={(event) => {
                setForm({ ...form, min: event.target.value });
              }}
            />
            <Field
              label="Total uses (blank = unlimited)"
              type="number"
              min="1"
              value={form.limit}
              onChange={(event) => {
                setForm({ ...form, limit: event.target.value });
              }}
            />
            <Field
              label="Ends on"
              type="date"
              value={form.endsAt}
              onChange={(event) => {
                setForm({ ...form, endsAt: event.target.value });
              }}
            />
            <Check
              label="First order only"
              checked={form.firstOrderOnly}
              onChange={(event) => {
                setForm({ ...form, firstOrderOnly: event.target.checked });
              }}
            />
            <div className="flex items-center gap-3 sm:col-span-4">
              <Button type="submit" disabled={action.busy}>
                Create coupon
              </Button>
              {action.status}
            </div>
          </form>
        </Panel>
      ) : null}
      <DataTable<Coupon>
        path="/coupons"
        csvName="coupons"
        version={version}
        searchLabel="Code"
        rowKey={(row) => row.id}
        columns={[
          {
            key: 'code',
            label: 'Code',
            sort: 'code',
            render: (row) => <span className="font-medium">{row.code}</span>,
          },
          { key: 'value', label: 'Gives', render: value },
          {
            key: 'min',
            label: 'Minimum',
            render: (row) => (row.minSubtotalMinor ? formatPrice(row.minSubtotalMinor) : '—'),
          },
          {
            key: 'used',
            label: 'Used',
            sort: 'usageCount',
            render: (row) => `${row.usageCount}${row.usageLimit ? ` / ${row.usageLimit}` : ''}`,
            className: 'tabular',
          },
          {
            key: 'ends',
            label: 'Ends',
            render: (row) => (row.endsAt ? formatDate(row.endsAt) : 'No end'),
          },
          {
            key: 'active',
            label: 'Status',
            render: (row) => <StatusBadge value={row.active ? 'ACTIVE' : 'PAUSED'} />,
          },
        ]}
        actions={
          canWrite
            ? (row) => (
                <Button
                  variant="ghost"
                  className="min-h-9"
                  onClick={() => {
                    void adminSend('PATCH', `/coupons/${row.id}`, { active: !row.active }).then(
                      refresh,
                    );
                  }}
                >
                  {row.active ? 'Pause' : 'Resume'}
                </Button>
              )
            : undefined
        }
      />
    </>
  );
}
