// TV3 — Contract Auth phía web, đồng bộ với backend/src/types/auth.types.ts (cùng cách đặt tên như product.ts/product.types.ts).
export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  loyaltyPoints: number;
}
export interface AuthSession {
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: number;
  user: PublicUser;
}
// Mã lỗi backend gửi kèm response để UI phân biệt trường hợp mà không phụ thuộc câu chữ thông báo.
export type AuthErrorCode =
  | "VALIDATION_FAILED"
  | "EMAIL_TAKEN"
  | "INVALID_CREDENTIALS"
  | "TOKEN_MISSING"
  | "TOKEN_INVALID"
  | "TOKEN_EXPIRED";
