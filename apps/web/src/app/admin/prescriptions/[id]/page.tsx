import { PrescriptionReview } from '@/components/admin/prescriptions';

export default async function AdminPrescription({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PrescriptionReview id={id} />;
}
