"use client";
// THÀNH VIÊN 3 — Đặt mật khẩu mới (/reset-password#token=...). Token nằm sau dấu # nên không bị gửi lên máy chủ web hay header Referer;
// view đọc token rồi xóa nó khỏi thanh địa chỉ/lịch sử ngay. Thành công thì chuyển về /login (không tự đăng nhập).
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { authClient } from "@/features/auth/auth.service";
import {
  validateNewPassword,
  type FieldErrors,
} from "@/features/auth/validation";
import { ApiError } from "@/lib/api-client";
import { AuthField } from "../AuthField";
import { describeAuthError } from "../describe-error";
import styles from "../auth.module.css";
const INVALID_LINK_MESSAGE =
  "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn. Hãy yêu cầu liên kết mới.";
export function ResetPasswordView() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [linkMessage, setLinkMessage] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    const fromHash = new URLSearchParams(
      window.location.hash.replace(/^#/, ""),
    ).get("token");
    // `prev ??` giữ token cũ khi React chạy hiệu ứng hai lần ở chế độ phát triển (lần hai hash đã bị xóa).
    setToken((prev) => prev ?? fromHash);
    setReady(true);
    if (window.location.hash)
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
  }, []);
  function focusFirstInvalid(found: FieldErrors) {
    const first = (["password", "confirmPassword"] as const).find(
      (key) => found[key],
    );
    if (first) document.getElementById(`reset-${first}`)?.focus();
  }
  async function submitReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || !token) return;
    setFormError(null);
    const found = validateNewPassword(password, confirmPassword);
    setErrors(found);
    if (Object.keys(found).length > 0) return focusFirstInvalid(found);
    setSubmitting(true);
    try {
      await authClient.resetPassword(token, password);
      router.replace("/login?reason=password-reset");
    } catch (error) {
      setSubmitting(false);
      if (error instanceof ApiError && error.code === "RESET_TOKEN_INVALID") {
        setLinkMessage(error.message || INVALID_LINK_MESSAGE);
        return;
      }
      const described = describeAuthError(error);
      setErrors(described.fields ?? {});
      setFormError(described.form ?? null);
      if (described.fields) focusFirstInvalid(described.fields);
    }
  }
  if (!ready)
    return (
      <section className={styles.page}>
        <h1 className={styles.title}>Đặt mật khẩu mới</h1>
      </section>
    );
  if (!token || linkMessage)
    return (
      <section className={styles.page}>
        <h1 className={styles.title}>Liên kết không dùng được</h1>
        <p className={styles.alert} role="alert">
          {linkMessage ?? INVALID_LINK_MESSAGE}
        </p>
        <Link
          className={`primary-button ${styles.submit}`}
          href="/forgot-password"
        >
          Yêu cầu liên kết mới
        </Link>
        <p className={styles.switch}>
          <Link href="/login">Quay lại đăng nhập</Link>
        </p>
      </section>
    );
  return (
    <section className={styles.page}>
      <h1 className={styles.title}>Đặt mật khẩu mới</h1>
      <p className={styles.lead}>
        Chọn mật khẩu mới cho tài khoản của bạn. Sau khi đổi, hãy đăng nhập lại
        bằng mật khẩu mới.
      </p>
      {formError ? (
        <p className={styles.alert} role="alert">
          {formError}
        </p>
      ) : null}
      <form className={styles.form} onSubmit={submitReset} noValidate>
        <AuthField
          id="reset-password"
          name="password"
          label="Mật khẩu mới"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          hint="Ít nhất 8 ký tự, gồm cả chữ và số."
          error={errors.password}
          disabled={submitting}
        />
        <AuthField
          id="reset-confirmPassword"
          name="confirmPassword"
          label="Nhập lại mật khẩu mới"
          type="password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          autoComplete="new-password"
          error={errors.confirmPassword}
          disabled={submitting}
        />
        <button
          type="submit"
          className={`primary-button ${styles.submit}`}
          disabled={submitting}
        >
          {submitting ? "Đang lưu..." : "Đặt mật khẩu mới"}
        </button>
      </form>
    </section>
  );
}
