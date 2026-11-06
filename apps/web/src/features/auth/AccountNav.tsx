"use client";
// TV3 — Khu vực tài khoản trên header: "Đăng nhập" khi chưa có phiên; tên + "Đăng xuất" khi đã đăng nhập.
// Đăng xuất xóa phiên và về menu, không xóa giỏ hàng.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "./auth.service";
import styles from "./AccountNav.module.css";
import { useSession } from "./useSession";
export function AccountNav() {
  const session = useSession();
  const router = useRouter();
  if (!session)
    return (
      <Link href="/login" className="login-link">
        Đăng nhập
      </Link>
    );
  return (
    <span className={styles.wrap}>
      <span className={styles.name} title={session.user.email}>
        Xin chào, {session.user.displayName}
      </span>
      <button
        type="button"
        className={styles.logout}
        onClick={() => {
          authClient.logout();
          router.push("/");
        }}
      >
        Đăng xuất
      </button>
    </span>
  );
}
