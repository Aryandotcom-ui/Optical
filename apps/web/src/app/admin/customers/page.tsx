import { Suspense } from 'react';
import { CustomersList } from '@/components/admin/customers';

export default function AdminCustomers() {
  return (
    <Suspense>
      <CustomersList />
    </Suspense>
  );
}
