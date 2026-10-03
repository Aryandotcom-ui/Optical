import { Suspense } from 'react';
import { Settings } from '@/components/admin/settings';

export default function AdminSettingsPage() {
  return (
    <Suspense>
      <Settings />
    </Suspense>
  );
}
