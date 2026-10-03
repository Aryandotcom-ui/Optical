import type { AdminListQuery, AdminPage } from '@optical/shared/admin';
import type { FastifyReply } from 'fastify';

/** Most rows a CSV export returns; beyond that, filter first. */
export const CSV_LIMIT = 5_000;

/** Skip/take for a page, or every row (up to the cap) for a CSV export. */
export function paging(query: AdminListQuery): { skip: number; take: number } {
  if (query.format === 'csv') return { skip: 0, take: CSV_LIMIT };
  return { skip: (query.page - 1) * query.pageSize, take: query.pageSize };
}

/** The requested sort column if it is one of the allowed ones, else the default. */
export function sortBy<T extends string>(
  query: AdminListQuery,
  allowed: readonly T[],
  fallback: T,
): T {
  return allowed.find((column) => column === query.sort) ?? fallback;
}

function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let raw: string;
  if (typeof value === 'string') raw = value;
  else if (typeof value === 'number' || typeof value === 'boolean') raw = String(value);
  else if (value instanceof Date) raw = value.toISOString();
  else raw = JSON.stringify(value);
  // Quote everything; neutralise spreadsheet formulas (CSV injection).
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function toCsv<T>(
  rows: readonly T[],
  columns: readonly [string, (row: T) => unknown][],
): string {
  const header = columns.map(([name]) => cell(name)).join(',');
  const body = rows.map((row) => columns.map(([, get]) => cell(get(row))).join(','));
  return [header, ...body].join('\r\n');
}

/**
 * Sends a list as JSON (one page) or as a CSV download, from the same query,
 * so an export always matches what the filters show.
 */
export function respond<T>(
  reply: FastifyReply,
  query: AdminListQuery,
  result: { items: T[]; total: number },
  csv: { name: string; columns: readonly [string, (row: T) => unknown][] },
): AdminPage<T> | string {
  if (query.format === 'csv') {
    void reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="${csv.name}.csv"`);
    return toCsv(result.items, csv.columns);
  }
  return { items: result.items, total: result.total, page: query.page, pageSize: query.pageSize };
}
