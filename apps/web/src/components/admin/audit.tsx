'use client';

import { formatDateTime } from './admin-api';
import { DataTable } from './data-table';
import { PageHeader } from './ui';

interface Entry {
  id: string;
  actorEmail: string;
  action: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
  createdAt: string;
}

const ENTITIES = [
  'Order',
  'Prescription',
  'Product',
  'ProductVariant',
  'ProductImage',
  'StockItem',
  ...['purposes', 'indexes', 'coatings', 'packages', 'tints'].map((kind) => `Lens:${kind}`),
  'LensRule',
  'Coupon',
  'Review',
  'HelpArticle',
  'User',
  'Setting',
  'FeatureFlag',
];

/** Field-level differences between the before and after snapshots. */
function changes(before: unknown, after: unknown): string {
  if (!before || typeof before !== 'object') return after ? 'Created' : '';
  if (!after || typeof after !== 'object') return 'Removed';
  const was = before as Record<string, unknown>;
  const now = after as Record<string, unknown>;
  const keys = Object.keys(now).filter(
    (key) => key !== 'updatedAt' && JSON.stringify(was[key]) !== JSON.stringify(now[key]),
  );
  return keys
    .slice(0, 6)
    .map(
      (key) =>
        `${key}: ${was[key] === undefined ? '—' : JSON.stringify(was[key])} → ${JSON.stringify(now[key])}`,
    )
    .join('; ');
}

/** Every change made in the admin: who, what, when, before and after. */
export function AuditLog() {
  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every change made here, newest first. Export to CSV for the full before and after records."
      />
      <DataTable<Entry>
        path="/audit"
        csvName="audit-log"
        searchLabel="Action or email"
        rowKey={(row) => row.id}
        filters={[
          {
            name: 'entityType',
            label: 'Record',
            options: [
              { value: '', label: 'Everything' },
              ...ENTITIES.map((entity) => ({ value: entity, label: entity })),
            ],
          },
        ]}
        columns={[
          {
            key: 'when',
            label: 'When',
            sort: 'createdAt',
            render: (row) => formatDateTime(row.createdAt),
            className: 'whitespace-nowrap',
          },
          { key: 'who', label: 'Who', render: (row) => row.actorEmail },
          { key: 'action', label: 'Action', render: (row) => <code>{row.action}</code> },
          {
            key: 'record',
            label: 'Record',
            render: (row) => `${row.entityType} ${row.entityId.slice(0, 12)}`,
          },
          {
            key: 'change',
            label: 'Change',
            render: (row) => (
              <span className="break-words text-ink-secondary">
                {changes(row.before, row.after)}
              </span>
            ),
          },
        ]}
      />
    </>
  );
}
