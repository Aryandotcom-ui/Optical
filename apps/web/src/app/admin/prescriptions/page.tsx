import { Suspense } from 'react';
import { PrescriptionQueue } from '@/components/admin/prescriptions';

export default function AdminPrescriptions() {
  return (
    <Suspense>
      <PrescriptionQueue />
    </Suspense>
  );
}
