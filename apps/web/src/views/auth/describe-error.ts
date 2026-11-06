// TV3 — Đổi lỗi từ API client thành thông báo hiển thị: lỗi theo ô (400/409) hoặc lỗi chung của form.
import { ApiError } from "@/lib/api-client";
import { SessionStorageError } from "@/features/auth/session";
import type { FieldErrors } from "@/features/auth/validation";
export interface DescribedError {
  form?: string;
  fields?: FieldErrors;
}
export function describeAuthError(error: unknown): DescribedError {
  if (error instanceof ApiError) {
    const fields: FieldErrors = {};
    if (error.fieldErrors?.email) fields.email = error.fieldErrors.email;
    if (error.fieldErrors?.password)
      fields.password = error.fieldErrors.password;
    if (fields.email || fields.password) return { fields };
    return { form: error.message };
  }
  if (error instanceof SessionStorageError) return { form: error.message };
  return { form: "Có lỗi xảy ra. Thử lại sau ít phút." };
}
