'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { formatPrice } from '@/lib/format';
import { adminSend, formatDate } from './admin-api';
import { useCanWrite } from './admin-context';
import { DataTable } from './data-table';
import { PageHeader, StatusBadge, useAction } from './ui';

interface ProductRow {
  id: string;
  slug: string;
  name: string;
  category: string;
  basePriceMinor: number;
  isPublished: boolean;
  variants: number;
  available: number;
  ratingAverage: number | null;
  updatedAt: string;
}

export function ProductsList() {
  const canWrite = useCanWrite('products');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [version, setVersion] = useState(0);
  const action = useAction();

  const bulk = (kind: 'publish' | 'unpublish' | 'archive') =>
    void action
      .run(async () => {
        const result = await adminSend<{ updated: number; skipped: number }>(
          'POST',
          '/products/bulk',
          { ids: [...selected], action: kind },
        );
        return result;
      })
      .then((result) => {
        if (!result) return;
        setSelected(new Set());
        setVersion((value) => value + 1);
      });

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  return (
    <>
      <PageHeader
        title="Products"
        description="New products start as drafts. Publishing needs at least one active colour."
        actions={
          canWrite ? (
            <Button asChild>
              <Link href={'/admin/products/new'}>New product</Link>
            </Button>
          ) : null
        }
      />
      {canWrite && selected.size > 0 ? (
        <div
          className="mb-4 flex flex-wrap items-center gap-2 rounded-card bg-surface-muted p-3"
          role="region"
          aria-label="Bulk actions"
        >
          <span className="text-caption">{selected.size} selected</span>
          <Button
            variant="secondary"
            disabled={action.busy}
            onClick={() => {
              bulk('publish');
            }}
          >
            Publish
          </Button>
          <Button
            variant="secondary"
            disabled={action.busy}
            onClick={() => {
              bulk('unpublish');
            }}
          >
            Unpublish
          </Button>
          <Button
            variant="ghost"
            disabled={action.busy}
            onClick={() => {
              bulk('archive');
            }}
          >
            Archive
          </Button>
          {action.status}
        </div>
      ) : null}
      <DataTable<ProductRow>
        path="/products"
        csvName="products"
        version={version}
        searchLabel="Name, slug or SKU"
        rowKey={(row) => row.id}
        rowLink={(row) => `/admin/products/${row.id}`}
        filters={[
          {
            name: 'status',
            label: 'Status',
            options: [
              { value: '', label: 'All' },
              { value: 'published', label: 'Published' },
              { value: 'draft', label: 'Drafts' },
            ],
          },
          {
            name: 'category',
            label: 'Category',
            options: [
              { value: '', label: 'All' },
              ...['eyeglasses', 'sunglasses', 'computer-glasses', 'kids', 'accessories'].map(
                (value) => ({ value, label: value.replace('-', ' ') }),
              ),
            ],
          },
        ]}
        columns={[
          ...(canWrite
            ? [
                {
                  key: 'select',
                  label: 'Select',
                  render: (row: ProductRow) => (
                    <input
                      type="checkbox"
                      aria-label={`Select ${row.name}`}
                      className="size-5"
                      checked={selected.has(row.id)}
                      onChange={() => {
                        toggle(row.id);
                      }}
                    />
                  ),
                },
              ]
            : []),
          {
            key: 'name',
            label: 'Product',
            sort: 'name',
            render: (row) => (
              <>
                <span className="block font-medium">{row.name}</span>
                <span className="text-ink-secondary">{row.category}</span>
              </>
            ),
          },
          {
            key: 'price',
            label: 'Price',
            sort: 'basePriceMinor',
            render: (row) => formatPrice(row.basePriceMinor),
            className: 'tabular text-right',
          },
          {
            key: 'status',
            label: 'Status',
            render: (row) => <StatusBadge value={row.isPublished ? 'PUBLISHED' : 'DRAFT'} />,
          },
          { key: 'colours', label: 'Colours', render: (row) => row.variants, className: 'tabular' },
          {
            key: 'stock',
            label: 'Available',
            render: (row) => row.available,
            className: 'tabular',
          },
          {
            key: 'rating',
            label: 'Rating',
            sort: 'ratingAverage',
            render: (row) => (row.ratingAverage ? row.ratingAverage.toFixed(1) : '—'),
          },
          {
            key: 'updated',
            label: 'Updated',
            sort: 'updatedAt',
            render: (row) => formatDate(row.updatedAt),
          },
        ]}
      />
    </>
  );
}
