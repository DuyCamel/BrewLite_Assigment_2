import { getProductDetail } from "@/lib/api";
import { ProductDetailView } from "@/views/customer/products/ProductDetailView";
import { notFound } from "next/navigation";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  try {
    const product = await getProductDetail(id);
    return <ProductDetailView product={product} />;
  } catch (error) {
    notFound(); // Trả về trang 404 nếu không tìm thấy món
  }
}
