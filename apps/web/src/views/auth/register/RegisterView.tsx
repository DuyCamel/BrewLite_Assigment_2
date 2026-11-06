"use client";
// THÀNH VIÊN 3 — Đăng ký (/register). submitRegister() kiểm tra form, gọi POST /auth/register rồi tự đăng nhập để người dùng đi tiếp luồng đặt món.
// Form chỉ có email và mật khẩu: không có ô chọn vai trò, và client không gửi role.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { authClient } from "@/features/auth/auth.service";
import { safeReturnUrl } from "@/features/auth/return-url";
import {
  PASSWORD_MIN_LENGTH,
  validateRegister,
  type FieldErrors,
} from "@/features/auth/validation";
import { AuthField } from "../AuthField";
import { describeAuthError } from "../describe-error";
import styles from "../auth.module.css";
export function RegisterView() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [returnUrl, setReturnUrl] = useState<string | null>(null);
  useEffect(() => {
    setReturnUrl(new URLSearchParams(window.location.search).get("returnUrl"));
  }, []);
  const target = safeReturnUrl(returnUrl);
  const returnQuery =
    target === "/" ? "" : `&returnUrl=${encodeURIComponent(target)}`;
  const loginHref =
    target === "/"
      ? "/login"
      : `/login?returnUrl=${encodeURIComponent(target)}`;
  function focusFirstInvalid(found: FieldErrors) {
    const first = (["email", "password", "confirmPassword"] as const).find(
      (key) => found[key],
    );
    if (first) document.getElementById(`register-${first}`)?.focus();
  }
  async function submitRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setFormError(null);
    const found = validateRegister(email, password, confirmPassword);
    setErrors(found);
    if (Object.keys(found).length > 0) return focusFirstInvalid(found);
    setSubmitting(true);
    try {
      await authClient.register(email.trim(), password);
    } catch (error) {
      const described = describeAuthError(error);
      setErrors(described.fields ?? {});
      setFormError(described.form ?? null);
      setSubmitting(false);
      if (described.fields) focusFirstInvalid(described.fields);
      return;
    }
    // Tài khoản đã tạo xong. Đăng nhập tự động; nếu bước này lỗi thì chuyển sang /login để người dùng tự đăng nhập.
    try {
      await authClient.login(email.trim(), password);
      router.replace(target);
    } catch {
      router.replace(`/login?reason=registered${returnQuery}`);
    }
  }
  return (
    <section className={styles.page}>
      <h1 className={styles.title}>Tạo tài khoản</h1>
      <p className={styles.lead}>
        Chỉ cần email và mật khẩu để đặt món và tích điểm.
      </p>
      {formError ? (
        <p className={styles.alert} role="alert">
          {formError}
        </p>
      ) : null}
      <form className={styles.form} onSubmit={submitRegister} noValidate>
        <AuthField
          id="register-email"
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
          id="register-password"
          name="password"
          label="Mật khẩu"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          hint={`Ít nhất ${PASSWORD_MIN_LENGTH} ký tự, gồm cả chữ và số.`}
          error={errors.password}
          disabled={submitting}
        />
        <AuthField
          id="register-confirmPassword"
          name="confirmPassword"
          label="Nhập lại mật khẩu"
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
          {submitting ? "Đang tạo tài khoản..." : "Tạo tài khoản"}
        </button>
      </form>
      <p className={styles.switch}>
        Đã có tài khoản? <Link href={loginHref}>Đăng nhập</Link>
      </p>
    </section>
  );
}
