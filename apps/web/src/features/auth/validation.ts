// TV3 — Kiểm tra form đăng nhập/đăng ký phía trình duyệt để báo lỗi ngay.
// Quy tắc phải khớp backend/src/services/auth-validation.ts; backend vẫn kiểm tra lại, đây chỉ là tiện ích cho người dùng.
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_BYTES = 72;
const EMAIL_MAX_LENGTH = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export type AuthFieldName = "email" | "password" | "confirmPassword";
export type FieldErrors = Partial<Record<AuthFieldName, string>>;
function emailError(rawEmail: string): string | undefined {
  const email = rawEmail.trim();
  if (email.length === 0) return "Nhập email của bạn.";
  if (email.length > EMAIL_MAX_LENGTH || !EMAIL_PATTERN.test(email))
    return "Email chưa đúng định dạng, ví dụ ten@example.com.";
  return undefined;
}
function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}
export function validateLogin(email: string, password: string): FieldErrors {
  const errors: FieldErrors = {};
  const emailMessage = emailError(email);
  if (emailMessage) errors.email = emailMessage;
  if (password.length === 0) errors.password = "Nhập mật khẩu.";
  else if (byteLength(password) > PASSWORD_MAX_BYTES)
    errors.password = "Mật khẩu không hợp lệ.";
  return errors;
}
// Quy tắc mật khẩu mới, dùng cho đăng ký và đặt lại mật khẩu (khớp backend/src/services/auth-validation.ts).
function newPasswordError(password: string): string | undefined {
  if (password.length === 0) return "Nhập mật khẩu.";
  if (password.length < PASSWORD_MIN_LENGTH)
    return `Mật khẩu cần ít nhất ${PASSWORD_MIN_LENGTH} ký tự.`;
  if (byteLength(password) > PASSWORD_MAX_BYTES)
    return `Mật khẩu quá dài, tối đa ${PASSWORD_MAX_BYTES} byte.`;
  if (!/\p{L}/u.test(password) || !/\p{Nd}/u.test(password))
    return "Mật khẩu cần có cả chữ và số.";
  return undefined;
}
export function validateForgotPassword(email: string): FieldErrors {
  const message = emailError(email);
  return message ? { email: message } : {};
}
export function validateNewPassword(
  password: string,
  confirmPassword: string,
): FieldErrors {
  const message = newPasswordError(password);
  if (message) return { password: message };
  return confirmPassword === password
    ? {}
    : { confirmPassword: "Mật khẩu nhập lại chưa khớp." };
}
export function validateRegister(
  email: string,
  password: string,
  confirmPassword: string,
): FieldErrors {
  const errors: FieldErrors = {};
  const emailMessage = emailError(email);
  if (emailMessage) errors.email = emailMessage;
  const passwordMessage = newPasswordError(password);
  if (passwordMessage) errors.password = passwordMessage;
  if (!errors.password && confirmPassword !== password)
    errors.confirmPassword = "Mật khẩu nhập lại chưa khớp.";
  return errors;
}
