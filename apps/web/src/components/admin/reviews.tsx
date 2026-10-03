'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { adminSend, formatDateTime } from './admin-api';
import { useCanWrite } from './admin-context';
import { DataTable } from './data-table';
import { PageHeader } from './ui';

interface ReviewRow {
  id: string;
  product: string;
  productSlug: string;
  authorName: string;
  rating: number;
  title: string;
  body: string;
  status: string;
  orderItemId: string | null;
  createdAt: string;
}

/** Reviews go live only once moderated; the product's rating counts published reviews. */
export function Reviews() {
  const canWrite = useCanWrite('reviews');
  const [version, setVersion] = useState(0);
  const moderate = (id: string, status: 'PUBLISHED' | 'REJECTED') =>
    void adminSend('POST', `/reviews/${id}/moderate`, { status }).then(() => {
      setVersion((value) => value + 1);
    });
  return (
    <>
      <PageHeader
        title="Reviews"
        description="Publish honest reviews, good or bad. Reject only spam, abuse or personal data."
      />
      <DataTable<ReviewRow>
        path="/reviews"
        version={version}
        searchable={false}
        rowKey={(row) => row.id}
        filters={[
          {
            name: 'status',
            label: 'Status',
            options: [
              { value: 'PENDING', label: 'To moderate' },
              { value: 'PUBLISHED', label: 'Published' },
              { value: 'REJECTED', label: 'Rejected' },
            ],
          },
        ]}
        columns={[
          { key: 'product', label: 'Product', render: (row) => row.product },
          {
            key: 'rating',
            label: 'Rating',
            render: (row) => `${row.rating}/5`,
            className: 'tabular',
          },
          {
            key: 'review',
            label: 'Review',
            render: (row) => (
              <>
                <span className="block font-medium">{row.title}</span>
                <span className="block max-w-prose text-ink-secondary">{row.body}</span>
                <span className="text-ink-secondary">
                  {row.authorName}
                  {row.orderItemId ? ' · verified purchase' : ''} · {formatDateTime(row.createdAt)}
                </span>
              </>
            ),
          },
        ]}
        actions={
          canWrite
            ? (row) => (
                <span className="flex gap-1">
                  {row.status !== 'PUBLISHED' ? (
                    <Button
                      variant="secondary"
                      className="min-h-9"
                      onClick={() => {
                        moderate(row.id, 'PUBLISHED');
                      }}
                    >
                      Publish
                    </Button>
                  ) : null}
                  {row.status !== 'REJECTED' ? (
                    <Button
                      variant="ghost"
                      className="min-h-9"
                      onClick={() => {
                        moderate(row.id, 'REJECTED');
                      }}
                    >
                      Reject
                    </Button>
                  ) : null}
                </span>
              )
            : undefined
        }
      />
    </>
  );
}
