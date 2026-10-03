'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { adminGet, adminSend, formatDateTime } from './admin-api';
import { useCanWrite } from './admin-context';
import { DataTable } from './data-table';
import { Field, PageHeader, Panel, useAction } from './ui';

interface StockRow {
  variantId: string;
  productId: string;
  sku: string;
  product: string;
  colour: string;
  onHand: number;
  reserved: number;
  available: number;
  lowStockThreshold: number;
  low: boolean;
}

/** Stock per colour: adjustments are logged with a reason, and every one is audited. */
export function Inventory() {
  const canWrite = useCanWrite('inventory');
  const [editing, setEditing] = useState<StockRow | null>(null);
  const [version, setVersion] = useState(0);
  return (
    <>
      <PageHeader
        title="Inventory"
        description="Available = on hand minus units held for unpaid orders."
      />
      {editing ? (
        <Adjust
          row={editing}
          onDone={() => {
            setEditing(null);
            setVersion((value) => value + 1);
          }}
        />
      ) : null}
      <DataTable<StockRow>
        path="/inventory"
        csvName="inventory"
        version={version}
        searchLabel="Product or SKU"
        rowKey={(row) => row.variantId}
        filters={[
          {
            name: 'low',
            label: 'Show',
            options: [
              { value: '', label: 'Everything' },
              { value: 'true', label: 'Low stock only' },
            ],
          },
        ]}
        columns={[
          {
            key: 'product',
            label: 'Product',
            sort: 'product',
            render: (row) => (
              <>
                <span className="block font-medium">{row.product}</span>
                <span className="text-ink-secondary">{row.colour}</span>
              </>
            ),
          },
          { key: 'sku', label: 'SKU', sort: 'sku', render: (row) => row.sku },
          {
            key: 'onHand',
            label: 'On hand',
            render: (row) => row.onHand,
            className: 'tabular text-right',
          },
          {
            key: 'reserved',
            label: 'Held',
            render: (row) => row.reserved,
            className: 'tabular text-right',
          },
          {
            key: 'available',
            label: 'Available',
            sort: 'available',
            render: (row) => (
              <span className={row.low ? 'font-semibold text-danger-ink' : ''}>
                {row.available}
              </span>
            ),
            className: 'tabular text-right',
          },
          {
            key: 'threshold',
            label: 'Low at',
            render: (row) => row.lowStockThreshold,
            className: 'tabular text-right',
          },
        ]}
        actions={
          canWrite
            ? (row) => (
                <Button
                  variant="ghost"
                  className="min-h-9"
                  onClick={() => {
                    setEditing(row);
                  }}
                >
                  Adjust
                </Button>
              )
            : undefined
        }
      />
    </>
  );
}

function Adjust({ row, onDone }: { row: StockRow; onDone: () => void }) {
  const action = useAction();
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [threshold, setThreshold] = useState(String(row.lowStockThreshold));
  const [history, setHistory] = useState<
    { id: string; delta: number; reason: string; createdAt: string }[] | null
  >(null);
  return (
    <Panel title={`${row.product}, ${row.colour} (${row.sku})`} className="mb-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <form
          className="grid gap-3 sm:grid-cols-[8rem_1fr]"
          onSubmit={(event) => {
            event.preventDefault();
            void action
              .run(
                () =>
                  adminSend('POST', `/inventory/${row.variantId}/adjust`, {
                    delta: Number(delta),
                    reason,
                  }),
                'Stock adjusted.',
              )
              .then((result) => {
                if (result) onDone();
              });
          }}
        >
          <Field
            label="Change (+/−)"
            type="number"
            required
            step="1"
            value={delta}
            onChange={(event) => {
              setDelta(event.target.value);
            }}
            hint={`On hand now: ${row.onHand}`}
          />
          <Field
            label="Reason"
            required
            maxLength={200}
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
            }}
            hint="e.g. Delivery from supplier, damaged in QC, stock count"
          />
          <div className="col-span-full flex gap-2">
            <Button type="submit" disabled={action.busy}>
              Adjust stock
            </Button>
            <Button variant="ghost" onClick={onDone}>
              Close
            </Button>
          </div>
        </form>
        <form
          className="flex items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void action
              .run(() =>
                adminSend('PATCH', `/inventory/${row.variantId}`, {
                  lowStockThreshold: Number(threshold),
                }),
              )
              .then((result) => {
                if (result) onDone();
              });
          }}
        >
          <Field
            label="Low-stock threshold"
            type="number"
            min="0"
            max="1000"
            value={threshold}
            onChange={(event) => {
              setThreshold(event.target.value);
            }}
          />
          <Button type="submit" variant="secondary" disabled={action.busy}>
            Save
          </Button>
        </form>
      </div>
      {action.status}
      <div className="mt-4">
        {history ? (
          <ul className="space-y-1 text-caption">
            {history.length === 0 ? (
              <li className="text-ink-secondary">No adjustments yet.</li>
            ) : null}
            {history.map((entry) => (
              <li key={entry.id}>
                <span className="tabular">{entry.delta > 0 ? `+${entry.delta}` : entry.delta}</span>{' '}
                · {entry.reason} · {formatDateTime(entry.createdAt)}
              </li>
            ))}
          </ul>
        ) : (
          <Button
            variant="ghost"
            onClick={() => {
              void adminGet<typeof history>(`/inventory/${row.variantId}/history`).then(setHistory);
            }}
          >
            Show adjustment history
          </Button>
        )}
      </div>
    </Panel>
  );
}
