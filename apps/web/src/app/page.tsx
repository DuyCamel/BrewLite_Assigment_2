// TV1 — Route mỏng: lấy dữ liệu API, truyền cho view trang chính.
import { getProducts } from "@/lib/api";
import { HomeView } from "@/views/customer/main/HomeView";
export const dynamic = "force-dynamic";
export default async function HomePage() {
  try {
    return <HomeView products={await getProducts()} />;
  } catch {
    return <HomeView products={[]} loadError />;
  }
}
