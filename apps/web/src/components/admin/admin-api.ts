'use client';

import type { AdminMe, AdminPage } from '@optical/shared/admin';
import { call, refreshSession } from '@/lib/bag-api';

export { CommerceError } from '@/lib/bag-api';
export type { AdminMe, AdminPage };

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/+$/, '');

export const adminGet = <T>(path: string) => call<T>('GET', `/v1/admin${path}`);
export const adminSend = <T>(
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
) => call<T>(method, `/v1/admin${path}`, body === undefined ? {} : { body });
export const adminUpload = <T>(path: string, file: File) => {
  const form = new FormData();
  form.append('file', file);
  return call<T>('POST', `/v1/admin${path}`, { form });
};

/** Downloads a list as CSV with the same filters as the table on screen. */
export async function adminCsv(path: string, query: URLSearchParams, filename: string) {
  const params = new URLSearchParams(query);
  params.set('format', 'csv');
  params.delete('page');
  const url = `${API_URL}/v1/admin${path}?${params.toString()}`;
  let response = await fetch(url, { credentials: 'include' });
  if (response.status === 401 && (await refreshSession()))
    response = await fetch(url, { credentials: 'include' });
  if (!response.ok) throw new Error(`Export failed (${response.status})`);
  const href = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = href;
  link.download = `${filename}.csv`;
  link.click();
  setTimeout(() => {
    URL.revokeObjectURL(href);
  }, 10_000);
}

const dateTime = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
const date = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' });
export const formatDateTime = (value: string | Date) => dateTime.format(new Date(value));
export const formatDate = (value: string | Date) => date.format(new Date(value));

/** "PRESCRIPTION_REVIEW" → "Prescription review". */
export const humanise = (value: string) =>
  value.charAt(0) + value.slice(1).toLowerCase().replaceAll('_', ' ').replaceAll('-', ' ');
