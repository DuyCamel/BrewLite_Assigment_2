import Link from "next/link";
export default function NotFound() {
  return (
    <section className="container state">
      <h1>Không tìm thấy trang</h1>
      <Link href="/">Về thực đơn</Link>
    </section>
  );
}
