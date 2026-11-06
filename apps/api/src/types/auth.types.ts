// TV3 — Contract Auth dùng chung cho backend. Bản đồng bộ phía web: src/features/auth/auth.types.ts.
// Tuyệt đối không đưa passwordHash vào bất kỳ response nào: chỉ UserRecord (nội bộ) mới có trường này.
export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  loyaltyPoints: number;
}
export interface UserRecord extends PublicUser {
  passwordHash: string;
}
// Thông tin rút ra từ JWT đã xác thực; TV4/TV5/TV6 nhận qua @CurrentUser().
export interface AuthenticatedUser {
  id: string;
  email: string;
}
export interface AuthSession {
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: number;
  user: PublicUser;
}
// Mã lỗi ổn định để frontend phân biệt trường hợp (không phụ thuộc vào câu chữ thông báo).
export type AuthErrorCode =
  | "VALIDATION_FAILED"
  | "EMAIL_TAKEN"
  | "INVALID_CREDENTIALS"
  | "TOKEN_MISSING"
  | "TOKEN_INVALID"
  | "TOKEN_EXPIRED";
