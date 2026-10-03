import { Suspense } from 'react';
import { AuditLog } from '@/components/admin/audit';

export default function AdminAuditLogPage() {
  return (
    <Suspense>
      <AuditLog />
    </Suspense>
  );
}
