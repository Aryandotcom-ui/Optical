import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AdminShell } from '@/components/admin/admin-shell';

export const metadata: Metadata = {
  title: 'Admin',
  // The admin is never indexed, and pages hold live customer data.
  robots: { index: false, follow: false },
};

/** The store team's admin: rendered in the browser from the API, which checks every request. */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
