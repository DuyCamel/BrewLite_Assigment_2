// TV1 — Layout khách hàng; không có trang Admin/Nhân viên. TV3: khu vực tài khoản trên header dùng <AccountNav />.
import Link from "next/link";
import { AccountNav } from "@/features/auth/AccountNav";
import { CartLink } from "@/features/cart/CartLink";
export function CustomerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="header">
        <div className="container header-inner">
          <Link href="/" className="brand" aria-label="BrewLite trang chủ">
            <span className="brand-mark">b.</span>BrewLite
            <span className="brand-dot">●</span>
          </Link>
          <nav aria-label="Điều hướng chính">
            <Link href="/">Thực đơn</Link>
            <Link href="/orders">Đơn của tôi</Link>
          </nav>
          <div className="account-nav">
            <AccountNav />
            <CartLink />
          </div>
        </div>
      </header>
      <main>{children}</main>
      <footer className="footer container">
        <Link href="/" className="brand">
          BrewLite.
        </Link>
        <p>Một chút ngon, một ngày nhẹ nhàng.</p>
        <span>Đặt trước · Nhận tại quầy</span>
      </footer>
    </>
  );
}
