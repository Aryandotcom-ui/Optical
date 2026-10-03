'use client';

import { helpTopics } from '@optical/shared/admin';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { adminSend, humanise } from './admin-api';
import { useCanWrite } from './admin-context';
import { DataTable } from './data-table';
import { Check, Field, PageHeader, Panel, Select, StatusBadge, TextArea, useAction } from './ui';

interface Article {
  id: string;
  slug: string;
  title: string;
  topic: string;
  body: string;
  sortOrder: number;
  isPublished: boolean;
}

type Draft = Omit<Article, 'id' | 'sortOrder'> & { id: string | null; sortOrder: string };

const blank: Draft = {
  id: null,
  slug: '',
  title: '',
  topic: helpTopics[0],
  body: '',
  sortOrder: '0',
  isPublished: true,
};

/** Help-centre questions and answers (the storefront FAQ). */
export function HelpArticles() {
  const canWrite = useCanWrite('content');
  const [version, setVersion] = useState(0);
  const [draft, setDraft] = useState<Draft>(blank);
  const action = useAction();
  const refresh = () => {
    setVersion((current) => current + 1);
  };

  const save = () => {
    const body = {
      slug: draft.slug,
      title: draft.title,
      topic: draft.topic,
      body: draft.body,
      sortOrder: Number(draft.sortOrder),
      isPublished: draft.isPublished,
    };
    void action
      .run(
        () =>
          draft.id
            ? adminSend('PATCH', `/help/${draft.id}`, body)
            : adminSend('POST', '/help', body),
        draft.id ? 'Article saved.' : 'Article added.',
      )
      .then((saved) => {
        if (saved) {
          setDraft(blank);
          refresh();
        }
      });
  };

  return (
    <>
      <PageHeader
        title="Help centre"
        description="Questions and answers shown on the Help page. Plain text; blank lines start new paragraphs."
      />
      {canWrite ? (
        <Panel title={draft.id ? `Edit “${draft.title}”` : 'New article'} className="mb-6">
          <form
            className="grid gap-3 sm:grid-cols-3"
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <Field
              label="Question"
              required
              className="sm:col-span-2"
              value={draft.title}
              onChange={(event) => {
                setDraft({ ...draft, title: event.target.value });
              }}
            />
            <Field
              label="Slug"
              required
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              hint="Lowercase words joined by hyphens"
              value={draft.slug}
              onChange={(event) => {
                setDraft({ ...draft, slug: event.target.value });
              }}
            />
            <Select
              label="Topic"
              value={draft.topic}
              onChange={(event) => {
                setDraft({ ...draft, topic: event.target.value });
              }}
              options={helpTopics.map((topic) => ({ value: topic, label: humanise(topic) }))}
            />
            <Field
              label="Order"
              type="number"
              min="0"
              value={draft.sortOrder}
              onChange={(event) => {
                setDraft({ ...draft, sortOrder: event.target.value });
              }}
            />
            <Check
              label="Published"
              checked={draft.isPublished}
              onChange={(event) => {
                setDraft({ ...draft, isPublished: event.target.checked });
              }}
            />
            <TextArea
              label="Answer"
              required
              className="sm:col-span-3"
              rows={6}
              value={draft.body}
              onChange={(event) => {
                setDraft({ ...draft, body: event.target.value });
              }}
            />
            <div className="flex flex-wrap items-center gap-2 sm:col-span-3">
              <Button type="submit" disabled={action.busy}>
                {draft.id ? 'Save article' : 'Add article'}
              </Button>
              {draft.id ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setDraft(blank);
                  }}
                >
                  Cancel
                </Button>
              ) : null}
              {action.status}
            </div>
          </form>
        </Panel>
      ) : null}
      <DataTable<Article>
        path="/help"
        version={version}
        searchLabel="Question"
        rowKey={(row) => row.id}
        columns={[
          {
            key: 'title',
            label: 'Question',
            render: (row) => <span className="font-medium">{row.title}</span>,
          },
          { key: 'topic', label: 'Topic', render: (row) => humanise(row.topic) },
          {
            key: 'order',
            label: 'Order',
            render: (row) => row.sortOrder,
            className: 'tabular text-right',
          },
          {
            key: 'state',
            label: 'State',
            render: (row) => <StatusBadge value={row.isPublished ? 'PUBLISHED' : 'DRAFT'} />,
          },
        ]}
        actions={
          canWrite
            ? (row) => (
                <span className="inline-flex gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setDraft({ ...row, sortOrder: String(row.sortOrder) });
                      window.scrollTo({ top: 0 });
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={action.busy}
                    onClick={() => {
                      if (!window.confirm(`Delete “${row.title}”? This can’t be undone.`)) return;
                      void action
                        .run(() => adminSend('DELETE', `/help/${row.id}`), 'Article deleted.')
                        .then(refresh);
                    }}
                  >
                    Delete
                  </Button>
                </span>
              )
            : undefined
        }
      />
    </>
  );
}
