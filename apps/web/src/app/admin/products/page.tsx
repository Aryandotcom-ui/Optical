import { Suspense } from 'react';
import { ProductsList } from '@/components/admin/products-list';

export default function AdminProducts() {
  return (
    <Suspense>
      <ProductsList />
    </Suspense>
  );
}
