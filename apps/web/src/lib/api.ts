// TV3 — Client phía server. Không đưa DB_PASSWORD/JWT_SECRET xuống trình duyệt.
// File này có "server-only" nên component trình duyệt không import được: client chạy trong trình duyệt (kèm JWT, ApiError) nằm ở lib/api-client.ts.
import "server-only";
import { Product } from "@/types/product";
export async function getProducts(): Promise<Product[]> {
  const response = await fetch(
    `${process.env.API_BASE_URL ?? "http://localhost:4000"}/products`,
    {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    },
  );
  if (!response.ok) throw new Error("Không tải được menu");
  return response.json();
}
// bổ sung bởi tv1 : thêm hàm getProductDetail để lấy chi tiết sản phẩm theo id
export async function getProductDetail(id: string): Promise<Product> {
  const response = await fetch(
    `${process.env.API_BASE_URL ?? "http://localhost:4000"}/products/${id}`,
    {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    },
  );
  if (!response.ok) throw new Error("Không lấy được sản phẩm theo id");
  return response.json();
}
