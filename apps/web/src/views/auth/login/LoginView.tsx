"use client";
// THÀNH VIÊN 3 — Đăng nhập (/login). submitLogin() kiểm tra form, gọi AuthClient.login (POST /auth/login), lưu JWT rồi về trang đang dở (returnUrl, ví dụ /checkout).
// Route app chỉ import view; không có SQL/secret trong frontend.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { authClient } from "@/features/auth/auth.service";
import { safeReturnUrl } from "@/features/auth/return-url";
import { validateLogin, type FieldErrors } from "@/features/auth/validation";
import { AuthField } from "../AuthField";
import { describeAuthError } from "../describe-error";
import styles from "../auth.module.css";
const NOTICES: Record<string, string> = {
  expired:
    "Phiên đăng nhập đã hết hạn. Đăng nhập lại để tiếp tục, giỏ hàng của bạn vẫn còn nguyên.",
  required: "Đăng nhập để tiếp tục đặt món. Giỏ hàng của bạn vẫn còn nguyên.",
  registered: "Tài khoản đã sẵn sàng. Đăng nhập để tiếp tục.",
  "password-reset": "Mật khẩu đã được đặt lại. Đăng nhập bằng mật khẩu mới.",
};
export function LoginView() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [returnUrl, setReturnUrl] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Đọc query ở trình duyệt (không dùng useSearchParams để khỏi cần Suspense khi build tĩnh).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setReturnUrl(params.get("returnUrl"));
    setNotice(NOTICES[params.get("reason") ?? ""] ?? null);
  }, []);
  const target = safeReturnUrl(returnUrl);
  const registerHref =
    target === "/"
      ? "/register"
      : `/register?returnUrl=${encodeURIComponent(target)}`;
  function focusFirstInvalid(found: FieldErrors) {
    const first = (["email", "password"] as const).find((key) => found[key]);
    if (first) document.getElementById(`login-${first}`)?.focus();
  }
  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setFormError(null);
    const found = validateLogin(email, password);
    setErrors(found);
    if (Object.keys(found).length > 0) return focusFirstInvalid(found);
    setSubmitting(true);
    try {
      await authClient.login(email.trim(), password);
      // Giữ nút khóa trong lúc chuyển trang để không gửi hai lần.
      router.replace(target);
    } catch (error) {
      const described = describeAuthError(error);
      setErrors(described.fields ?? {});
      setFormError(described.form ?? null);
      setSubmitting(false);
      if (described.fields) focusFirstInvalid(described.fields);
    }
  }
  return (
    <section className={styles.page}>
      <h1 className={styles.title}>Đăng nhập</h1>
      <p className={styles.lead}>
        Dùng tài khoản BrewLite để đặt món và theo dõi đơn của bạn.
      </p>
      {notice ? <p className={styles.notice}>{notice}</p> : null}
      {formError ? (
        <p className={styles.alert} role="alert">
          {formError}
        </p>
      ) : null}
      <form className={styles.form} onSubmit={submitLogin} noValidate>
        <AuthField
          id="login-email"
          name="email"
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="email"
          error={errors.email}
          disabled={submitting}
        />
        <AuthField
          id="login-password"
          name="password"
          label="Mật khẩu"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          error={errors.password}
          disabled={submitting}
        />
        <p className={styles.forgot}>
          <Link href="/forgot-password">Quên mật khẩu?</Link>
        </p>
        <button
          type="submit"
          className={`primary-button ${styles.submit}`}
          disabled={submitting}
        >
          {submitting ? "Đang đăng nhập..." : "Đăng nhập"}
        </button>
      </form>
      <p className={styles.switch}>
        Chưa có tài khoản? <Link href={registerHref}>Tạo tài khoản</Link>
      </p>
    </section>
  );
}
