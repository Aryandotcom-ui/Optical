'use client';

import type { Route } from 'next';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { adminCsv, adminGet, type AdminPage } from './admin-api';

export interface Column<T> {
  key: string;
  label: string;
  /** Server-side sort key, when the column can be sorted. */
  sort?: string;
  render: (row: T) => ReactNode;
  className?: string;
}

export interface Filter {
  name: string;
  label: string;
  options: { value: string; label: string }[];
}

type Load<T> = { key: string } & (
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; page: AdminPage<T> }
);

/**
 * Server-paginated, sortable, filterable table whose state lives in the
 * URL (so back, reload and sharing a link all work), with a CSV export of
 * exactly what the filters select.
 */
export function DataTable<T>({
  path,
  columns,
  rowKey,
  filters = [],
  searchLabel = 'Search',
  searchable = true,
  csvName,
  rowLink,
  actions,
  version = 0,
}: {
  path: string;
  columns: Column<T>[];
  rowKey: (row: T) => string;
  filters?: Filter[];
  searchLabel?: string;
  searchable?: boolean;
  csvName?: string;
  rowLink?: (row: T) => string;
  actions?: (row: T) => ReactNode;
  /** Bump to reload after a change made elsewhere on the page. */
  version?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const query = params.toString();
  const key = `${path}${query ? `?${query}` : ''}`;
  const [loaded, setLoaded] = useState<Load<T>>({ key: '', status: 'loading' });
  // A result for an older URL (or before the reload asked for by `version`) counts as loading.
  const [loadedVersion, setLoadedVersion] = useState(version);
  const state: Load<T> =
    loaded.key === key && loadedVersion === version ? loaded : { key, status: 'loading' };
  const [search, setSearch] = useState(params.get('q') ?? '');

  useEffect(() => {
    let current = true;
    adminGet<AdminPage<T>>(key).then(
      (page) => {
        if (!current) return;
        setLoaded({ key, status: 'ready', page });
        setLoadedVersion(version);
      },
      (error: unknown) => {
        if (!current) return;
        setLoaded({
          key,
          status: 'error',
          message: error instanceof Error ? error.message : 'Could not load.',
        });
        setLoadedVersion(version);
      },
    );
    return () => {
      current = false;
    };
  }, [key, version]);

  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === '') next.delete(key);
      else next.set(key, value);
    }
    if (!('page' in changes)) next.delete('page');
    router.replace(`${pathname}${next.size ? `?${next.toString()}` : ''}` as Route, {
      scroll: false,
    });
  };

  const sort = params.get('sort');
  const dir = params.get('dir') ?? 'desc';
  const page = state.status === 'ready' ? state.page : null;
  const pages = page ? Math.max(1, Math.ceil(page.total / page.pageSize)) : 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        {searchable ? (
          <form
            role="search"
            className="flex items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              update({ q: search.trim() });
            }}
          >
            <label className="text-caption font-medium">
              {searchLabel}
              <input
                type="search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                }}
                className="mt-1 block min-h-11 w-64 rounded-control bg-surface px-3 ring-1 ring-hairline ring-inset focus:ring-2 focus:ring-accent focus:outline-none"
              />
            </label>
            <Button type="submit" variant="secondary">
              Search
            </Button>
          </form>
        ) : null}
        {filters.map((filter) => (
          <label key={filter.name} className="text-caption font-medium">
            {filter.label}
            <select
              value={params.get(filter.name) ?? ''}
              onChange={(event) => {
                update({ [filter.name]: event.target.value });
              }}
              className="mt-1 block min-h-11 rounded-control bg-surface px-3 ring-1 ring-hairline ring-inset"
            >
              {filter.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ))}
        {csvName ? (
          <Button
            variant="ghost"
            className="ml-auto"
            onClick={() => void adminCsv(path, params, csvName)}
          >
            Export CSV
          </Button>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-card ring-1 ring-hairline ring-inset">
        <table className="w-full text-left text-caption">
          <thead className="bg-surface-muted">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn('px-3 py-2 font-medium whitespace-nowrap', column.className)}
                  aria-sort={
                    column.sort && sort === column.sort
                      ? dir === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : undefined
                  }
                >
                  {column.sort ? (
                    <button
                      type="button"
                      className="inline-flex min-h-8 items-center gap-1 hover:text-accent"
                      onClick={() => {
                        update({
                          sort: column.sort ?? null,
                          dir: sort === column.sort && dir === 'desc' ? 'asc' : 'desc',
                        });
                      }}
                    >
                      {column.label}
                      <span aria-hidden="true">
                        {sort === column.sort ? (dir === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    </button>
                  ) : (
                    column.label
                  )}
                </th>
              ))}
              {actions ? (
                <th scope="col" className="px-3 py-2">
                  <span className="sr-only">Actions</span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody aria-busy={state.status === 'loading'}>
            {state.status === 'error' ? (
              <tr>
                <td colSpan={columns.length + 1} className="px-3 py-6 text-danger-ink">
                  <span role="alert">{state.message}</span>
                </td>
              </tr>
            ) : null}
            {page?.items.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="px-3 py-6 text-ink-secondary">
                  Nothing matches. Clear the search or filters to see more.
                </td>
              </tr>
            ) : null}
            {page?.items.map((row) => (
              <tr
                key={rowKey(row)}
                className={cn(
                  'border-t border-hairline',
                  rowLink && 'cursor-pointer hover:bg-surface-muted',
                )}
                onClick={
                  rowLink
                    ? (event) => {
                        if ((event.target as HTMLElement).closest('a,button,input,select')) return;
                        router.push(rowLink(row) as Route);
                      }
                    : undefined
                }
              >
                {columns.map((column) => (
                  <td key={column.key} className={cn('px-3 py-2 align-top', column.className)}>
                    {column.render(row)}
                  </td>
                ))}
                {actions ? (
                  <td className="px-3 py-2 text-right whitespace-nowrap">{actions(row)}</td>
                ) : null}
              </tr>
            ))}
            {state.status === 'loading' && !page ? (
              <tr>
                <td colSpan={columns.length + 1} className="px-3 py-6 text-ink-secondary">
                  Loading…
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {page ? (
        <nav aria-label="Pages" className="flex items-center justify-between gap-3 text-caption">
          <p aria-live="polite">
            {page.total} {page.total === 1 ? 'row' : 'rows'} · page {page.page} of {pages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              disabled={page.page <= 1}
              onClick={() => {
                update({ page: String(page.page - 1) });
              }}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              disabled={page.page >= pages}
              onClick={() => {
                update({ page: String(page.page + 1) });
              }}
            >
              Next
            </Button>
          </div>
        </nav>
      ) : null}
    </div>
  );
}
