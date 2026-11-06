// TV3 — Kiểm tra dữ liệu đăng ký/đăng nhập. Hàm thuần, không đụng DB. Quy tắc phải khớp src/features/auth/validation.ts phía web.
import { BadRequestException } from "@nestjs/common";
import type { LoginInput, RegisterInput } from "../types/contracts.js";
export const PASSWORD_MIN_LENGTH = 8;
// bcrypt chỉ dùng 72 byte đầu; chặn sớm để mật khẩu dài không bị cắt âm thầm.
export const PASSWORD_MAX_BYTES = 72;
export const EMAIL_MAX_LENGTH = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export type AuthField = "email" | "password";
export type FieldErrors = Partial<Record<AuthField, string>>;
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}
function asRecord(body: unknown): Record<string, unknown> {
  return typeof body === "object" && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
}
function emailError(email: string): string | undefined {
  if (email.length === 0) return "Nhập email của bạn.";
  if (email.length > EMAIL_MAX_LENGTH || !EMAIL_PATTERN.test(email))
    return "Email chưa đúng định dạng, ví dụ ten@example.com.";
  return undefined;
}
function newPasswordError(password: string): string | undefined {
  if (password.length === 0) return "Nhập mật khẩu.";
  if (password.length < PASSWORD_MIN_LENGTH)
    return `Mật khẩu cần ít nhất ${PASSWORD_MIN_LENGTH} ký tự.`;
  if (Buffer.byteLength(password, "utf8") > PASSWORD_MAX_BYTES)
    return `Mật khẩu quá dài, tối đa ${PASSWORD_MAX_BYTES} byte.`;
  if (!/\p{L}/u.test(password) || !/\p{Nd}/u.test(password))
    return "Mật khẩu cần có cả chữ và số.";
  return undefined;
}
function loginPasswordError(password: string): string | undefined {
  if (password.length === 0) return "Nhập mật khẩu.";
  if (Buffer.byteLength(password, "utf8") > PASSWORD_MAX_BYTES)
    return "Mật khẩu không hợp lệ.";
  return undefined;
}
export function validationException(errors: FieldErrors): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    code: "VALIDATION_FAILED",
    message: "Thông tin chưa hợp lệ. Kiểm tra các ô được đánh dấu.",
    errors,
  });
}
function collect(
  emailMessage: string | undefined,
  passwordMessage: string | undefined,
): FieldErrors {
  const errors: FieldErrors = {};
  if (emailMessage) errors.email = emailMessage;
  if (passwordMessage) errors.password = passwordMessage;
  return errors;
}
// Chỉ đọc email/password. Mọi trường khác (ví dụ role, loyaltyPoints) bị bỏ qua: client không được tự cấp quyền.
export function parseRegisterInput(body: unknown): RegisterInput {
  const raw = asRecord(body);
  const email = typeof raw.email === "string" ? normalizeEmail(raw.email) : "";
  const password = typeof raw.password === "string" ? raw.password : "";
  const errors = collect(emailError(email), newPasswordError(password));
  if (Object.keys(errors).length > 0) throw validationException(errors);
  return { email, password };
}
// Token đặt lại mật khẩu: 32 byte ngẫu nhiên mã hóa base64url = đúng 43 ký tự.
export const RESET_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export function parseForgotPasswordInput(body: unknown): { email: string } {
  const raw = asRecord(body);
  const email = typeof raw.email === "string" ? normalizeEmail(raw.email) : "";
  const message = emailError(email);
  if (message) throw validationException({ email: message });
  return { email };
}
export function parseResetPasswordInput(body: unknown): {
  token: string;
  password: string;
} {
  const raw = asRecord(body);
  const token = typeof raw.token === "string" ? raw.token.trim() : "";
  const password = typeof raw.password === "string" ? raw.password : "";
  const message = newPasswordError(password);
  if (message) throw validationException({ password: message });
  return { token, password };
}
export function parseLoginInput(body: unknown): LoginInput {
  const raw = asRecord(body);
  const email = typeof raw.email === "string" ? normalizeEmail(raw.email) : "";
  const password = typeof raw.password === "string" ? raw.password : "";
  const errors = collect(emailError(email), loginPasswordError(password));
  if (Object.keys(errors).length > 0) throw validationException(errors);
  return { email, password };
}
