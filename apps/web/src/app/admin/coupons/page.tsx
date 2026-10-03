import { Suspense } from 'react';
import { Coupons } from '@/components/admin/coupons';

export default function AdminCouponsPage() {
  return (
    <Suspense>
      <Coupons />
    </Suspense>
  );
}
