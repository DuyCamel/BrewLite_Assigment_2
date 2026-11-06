// Khung trung tính cho route chưa triển khai. TODO chi tiết nằm trong source và docs/PHAN_CONG.md.
import Link from "next/link";
export function PendingPage({ title }: { title: string }) {
  return (
    <section className="container state stub">
      <h1>{title}</h1>
      <p>Chức năng đang được hoàn thiện.</p>
      <Link href="/">Quay về thực đơn</Link>
    </section>
  );
}
