import { Suspense } from 'react';
import { Inventory } from '@/components/admin/inventory';

export default function AdminInventory() {
  return (
    <Suspense>
      <Inventory />
    </Suspense>
  );
}
