import { Suspense } from 'react';
import { Reviews } from '@/components/admin/reviews';

export default function AdminReviewsPage() {
  return (
    <Suspense>
      <Reviews />
    </Suspense>
  );
}
