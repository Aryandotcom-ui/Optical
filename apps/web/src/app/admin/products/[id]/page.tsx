import { ProductEditor } from '@/components/admin/product-editor';

export default async function AdminProduct({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProductEditor id={id} />;
}
