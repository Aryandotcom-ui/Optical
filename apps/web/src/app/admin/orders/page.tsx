import { Suspense } from 'react';
import { OrdersList } from '@/components/admin/orders-list';

export default function AdminOrders() {
  return (
    <Suspense>
      <OrdersList />
    </Suspense>
  );
}
