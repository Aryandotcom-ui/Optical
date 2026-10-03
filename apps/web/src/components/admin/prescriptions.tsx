'use client';

import { correctionTemplates, type CorrectionTemplate } from '@optical/shared/admin';
import type { Route } from 'next';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatDioptres } from '@/components/configurator/rx-stepper';
import { Button } from '@/components/ui/button';
import { adminGet, adminSend, formatDateTime, humanise } from './admin-api';
import { useCanWrite } from './admin-context';
import { DataTable } from './data-table';
import { PageHeader, Panel, Select, StatusBadge, TextArea, useAction } from './ui';

interface QueueRow {
  id: string;
  label: string;
  status: string;
  customer: string;
  orders: string[];
  hasFile: boolean;
  hasValues: boolean;
  createdAt: string;
}

export function PrescriptionQueue() {
  return (
    <>
      <PageHeader
        title="Prescriptions"
        description="Check each prescription against its photo before lenses are made. Approving one releases its orders into production."
      />
      <DataTable<QueueRow>
        path="/prescriptions"
        rowKey={(row) => row.id}
        rowLink={(row) => `/admin/prescriptions/${row.id}`}
        searchable={false}
        filters={[
          {
            name: 'status',
            label: 'Status',
            options: [
              { value: 'PENDING_REVIEW', label: 'To review' },
              { value: 'NEEDS_CORRECTION', label: 'Waiting for the customer' },
              { value: 'VERIFIED', label: 'Approved' },
            ],
          },
        ]}
        columns={[
          { key: 'created', label: 'Received', render: (row) => formatDateTime(row.createdAt) },
          { key: 'customer', label: 'Customer', render: (row) => row.customer },
          { key: 'orders', label: 'Orders', render: (row) => row.orders.join(', ') },
          {
            key: 'what',
            label: 'Has',
            render: (row) =>
              [row.hasFile ? 'file' : null, row.hasValues ? 'typed values' : null]
                .filter(Boolean)
                .join(' + '),
          },
          { key: 'status', label: 'Status', render: (row) => <StatusBadge value={row.status} /> },
        ]}
      />
    </>
  );
}

interface Eye {
  sph: number | null;
  cyl: number | null;
  axis: number | null;
  add: number | null;
}
interface PrescriptionDetail {
  id: string;
  label: string;
  status: string;
  values: {
    right: Eye;
    left: Eye;
    pd: { kind: 'single'; value: number } | { kind: 'dual'; right: number; left: number };
  } | null;
  fileUrl: string | null;
  fileMime: string | null;
  reviewNote: string | null;
  verifiedAt: string | null;
  verifiedBy: { name: string } | null;
  createdAt: string;
  user: { name: string; email: string } | null;
  orderItems: { productName: string; order: { id: string; number: string; status: string } }[];
}

const dioptres = (value: number | null) => (value === null ? '—' : formatDioptres(value));

export function PrescriptionReview({ id }: { id: string }) {
  const [rx, setRx] = useState<PrescriptionDetail | null>(null);
  const [template, setTemplate] = useState<CorrectionTemplate>('unreadable');
  const [note, setNote] = useState('');
  const canWrite = useCanWrite('prescriptions');
  const action = useAction();

  useEffect(() => {
    adminGet<PrescriptionDetail>(`/prescriptions/${id}`).then(setRx, () => undefined);
  }, [id]);
  if (!rx) return <p aria-live="polite">Loading…</p>;

  const review = (body: object, done: string) =>
    void action
      .run(
        () => adminSend<PrescriptionDetail>('POST', `/prescriptions/${rx.id}/review`, body),
        done,
      )
      .then((next) => {
        if (next) {
          setRx(next);
          setNote('');
        }
      });

  return (
    <>
      <PageHeader
        title={`Prescription for ${rx.user?.name ?? 'a guest'}`}
        description={`Received ${formatDateTime(rx.createdAt)}${rx.user ? ` · ${rx.user.email}` : ''}`}
        actions={<StatusBadge value={rx.status} />}
      />
      <div className="mb-4">{action.status}</div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Uploaded file">
          {rx.fileUrl ? (
            rx.fileMime === 'application/pdf' ? (
              <p>
                <a
                  href={rx.fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent hover:underline"
                >
                  Open the PDF
                </a>{' '}
                (link valid for 10 minutes)
              </p>
            ) : (
              // A private, signed, short-lived link: next/image can't (and shouldn't) cache it.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={rx.fileUrl}
                alt="The customer’s uploaded prescription"
                className="max-h-[32rem] w-full rounded-control object-contain ring-1 ring-hairline"
              />
            )
          ) : (
            <p className="text-ink-secondary">No file: the customer typed the values in.</p>
          )}
        </Panel>
        <div className="space-y-6">
          <Panel title="Entered values">
            {rx.values ? (
              <table className="tabular w-full text-left text-caption">
                <thead className="text-ink-secondary">
                  <tr>
                    <th scope="col">Eye</th>
                    <th scope="col">SPH</th>
                    <th scope="col">CYL</th>
                    <th scope="col">AXIS</th>
                    <th scope="col">ADD</th>
                  </tr>
                </thead>
                <tbody>
                  {(['right', 'left'] as const).map((side) => (
                    <tr key={side}>
                      <th scope="row" className="py-1 text-left font-medium">
                        {side === 'right' ? 'Right (OD)' : 'Left (OS)'}
                      </th>
                      <td>{dioptres(rx.values?.[side].sph ?? null)}</td>
                      <td>{dioptres(rx.values?.[side].cyl ?? null)}</td>
                      <td>{rx.values?.[side].axis ?? '—'}</td>
                      <td>{dioptres(rx.values?.[side].add ?? null)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-ink-secondary">Only a file was uploaded.</p>
            )}
            {rx.values ? (
              <p className="mt-2 text-caption">
                PD:{' '}
                {rx.values.pd.kind === 'single'
                  ? `${rx.values.pd.value} mm`
                  : `${rx.values.pd.right} / ${rx.values.pd.left} mm`}
              </p>
            ) : null}
          </Panel>
          <Panel title="Orders">
            <ul className="space-y-1 text-caption">
              {rx.orderItems.map((item) => (
                <li key={`${item.order.id}-${item.productName}`}>
                  <Link
                    href={`/admin/orders/${item.order.id}` as Route}
                    className="text-accent hover:underline"
                  >
                    {item.order.number}
                  </Link>{' '}
                  · {item.productName} · {humanise(item.order.status)}
                </li>
              ))}
            </ul>
          </Panel>
          {rx.reviewNote || rx.verifiedBy ? (
            <Panel title="Last review">
              <p className="text-caption">
                {rx.verifiedBy
                  ? `Approved by ${rx.verifiedBy.name}${rx.verifiedAt ? ` on ${formatDateTime(rx.verifiedAt)}` : ''}. `
                  : ''}
                {rx.reviewNote}
              </p>
            </Panel>
          ) : null}
          {canWrite && rx.status !== 'VERIFIED' ? (
            <Panel title="Decision">
              <div className="space-y-3">
                <Button
                  disabled={action.busy}
                  onClick={() => {
                    review(
                      { decision: 'approve', note: note || undefined },
                      'Approved. The customer has been emailed.',
                    );
                  }}
                >
                  Approve prescription
                </Button>
                <hr className="border-hairline" />
                <Select
                  label="Ask for a correction"
                  value={template}
                  onChange={(event) => {
                    setTemplate(event.target.value as CorrectionTemplate);
                  }}
                  options={(Object.keys(correctionTemplates) as CorrectionTemplate[]).map(
                    (key) => ({ value: key, label: humanise(key) }),
                  )}
                />
                {correctionTemplates[template] ? (
                  <p className="text-caption text-ink-secondary">
                    Email says: “{correctionTemplates[template]}”
                  </p>
                ) : null}
                <TextArea
                  label="Add a note (optional; required for “Other”)"
                  maxLength={500}
                  value={note}
                  onChange={(event) => {
                    setNote(event.target.value);
                  }}
                />
                <Button
                  variant="secondary"
                  disabled={action.busy}
                  onClick={() => {
                    review(
                      { decision: 'correction', template, note: note || undefined },
                      'Correction requested. The customer has been emailed.',
                    );
                  }}
                >
                  Send correction request
                </Button>
              </div>
            </Panel>
          ) : null}
        </div>
      </div>
    </>
  );
}
