import { PackingSlip } from '@/components/admin/packing-slip';

export default async function AdminPackingSlip({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PackingSlip id={id} />;
}
