// TV1 — API contract sản phẩm. Tiền là số nguyên VNĐ, imageUrl=null nghĩa là chưa có ảnh.
export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  description: string;
  badge: string;
  imageUrl: string | null;
  stock: number;
  sizes: { name: string; extraPrice: number }[];
  toppings: { id: string; name: string; price: number }[];
}
