"use client";
// THÀNH VIÊN 3 — Quên mật khẩu (/forgot-password). Gửi email tới POST /auth/forgot-password.
// Server luôn trả cùng một thông báo dù email có tài khoản hay không, nên giao diện cũng không tiết lộ điều đó.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { authClient } from "@/features/auth/auth.service";
import {
  validateForgotPassword,
  type FieldErrors,
} from "@/features/auth/validation";
import { AuthField } from "../AuthField";
import { describeAuthError } from "../describe-error";
import styles from "../auth.module.css";
export function ForgotPasswordView() {
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sentMessage, setSentMessage] = useState<string | null>(null);
  const sentHeading = useRef<HTMLHeadingElement>(null);
  // Chuyển tiêu điểm tới thông báo để người dùng trình đọc màn hình biết đã gửi xong.
  useEffect(() => {
    if (sentMessage) sentHeading.current?.focus();
  }, [sentMessage]);
  async function submitForgot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setFormError(null);
    const found = validateForgotPassword(email);
    setErrors(found);
    if (found.email) return document.getElementById("forgot-email")?.focus();
    setSubmitting(true);
    try {
      setSentMessage(await authClient.requestPasswordReset(email.trim()));
    } catch (error) {
      const described = describeAuthError(error);
      setErrors(described.fields ?? {});
      setFormError(described.form ?? null);
    } finally {
      setSubmitting(false);
    }
  }
  if (sentMessage)
    return (
      <section className={styles.page}>
        <h1 className={styles.title} ref={sentHeading} tabIndex={-1}>
          Kiểm tra email của bạn
        </h1>
        <p className={styles.notice} role="status">
          {sentMessage}
        </p>
        <p className={styles.lead}>
          Liên kết chỉ dùng được một lần và sẽ hết hạn sau ít phút. Chưa thấy
          thư? Đợi một lúc rồi thử lại, hoặc kiểm tra xem bạn đã nhập đúng email
          chưa.
        </p>
        <button
          type="button"
          className={`outline-button ${styles.submit}`}
          onClick={() => setSentMessage(null)}
        >
          Nhập email khác
        </button>
        <p className={styles.switch}>
          <Link href="/login">Quay lại đăng nhập</Link>
        </p>
      </section>
    );
  return (
    <section className={styles.page}>
      <h1 className={styles.title}>Quên mật khẩu</h1>
      <p className={styles.lead}>
        Nhập email đã đăng ký, chúng tôi sẽ gửi liên kết để bạn đặt mật khẩu
        mới.
      </p>
      {formError ? (
        <p className={styles.alert} role="alert">
          {formError}
        </p>
      ) : null}
      <form className={styles.form} onSubmit={submitForgot} noValidate>
        <AuthField
          id="forgot-email"
          name="email"
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="email"
          error={errors.email}
          disabled={submitting}
        />
        <button
          type="submit"
          className={`primary-button ${styles.submit}`}
          disabled={submitting}
        >
          {submitting ? "Đang gửi..." : "Gửi liên kết đặt lại mật khẩu"}
        </button>
      </form>
      <p className={styles.switch}>
        Nhớ mật khẩu rồi? <Link href="/login">Đăng nhập</Link>
      </p>
    </section>
  );
}
