// TV3 — Gắn /login, /register, /forgot-password, /reset-password vào API NestJS (POST /auth/...) và quản lý phiên phía trình duyệt.
// TV2/TV5/TV6 gọi API cần đăng nhập qua authorizedRequest() ở cuối file: tự gắn Bearer token và xử lý 401.
import { apiRequest, ApiError, type RequestOptions } from "@/lib/api-client";
import type { AuthSession, PublicUser } from "@/types/auth";
import { safeReturnUrl } from "./return-url";
import {
  clearSession,
  loadSession,
  readRawSession,
  saveSession,
  type StoredSession,
} from "./session";
export type LoginRedirectReason = "expired" | "required";
export class AuthClient {
  // POST /auth/register: server không nhận role từ client, ở đây cũng không gửi.
  async register(email: string, password: string): Promise<PublicUser> {
    const result = await apiRequest<{ user: PublicUser }>("/auth/register", {
      method: "POST",
      body: { email, password },
    });
    return result.user;
  }
  // POST /auth/login rồi lưu phiên. Giỏ hàng nằm ở key localStorage khác nên không bị ảnh hưởng.
  async login(email: string, password: string): Promise<StoredSession> {
    const session = await apiRequest<AuthSession>("/auth/login", {
      method: "POST",
      body: { email, password },
    });
    return saveSession(session);
  }
  // POST /auth/forgot-password: luôn nhận cùng một thông báo dù email có tài khoản hay không.
  async requestPasswordReset(email: string): Promise<string> {
    const result = await apiRequest<{ message: string }>(
      "/auth/forgot-password",
      { method: "POST", body: { email } },
    );
    return result.message;
  }
  // POST /auth/reset-password. Token lấy từ liên kết trong email; lỗi RESET_TOKEN_INVALID nghĩa là liên kết hết hạn hoặc đã dùng.
  async resetPassword(token: string, password: string): Promise<string> {
    const result = await apiRequest<{ message: string }>(
      "/auth/reset-password",
      { method: "POST", body: { token, password } },
    );
    return result.message;
  }
  // Chỉ xóa phiên; giỏ hàng được giữ. Nơi gọi tự đưa người dùng về menu (xem AccountNav).
  logout(): void {
    clearSession();
  }
  // Token hết hạn/không hợp lệ: xóa phiên và đưa về /login, nhớ trang đang xem để quay lại sau khi đăng nhập.
  handleSessionExpired(reason: LoginRedirectReason = "expired"): void {
    clearSession();
    if (typeof window === "undefined") return;
    const { pathname, search, hash } = window.location;
    // Đang ở trang đăng nhập/đăng ký thì không chuyển hướng lại (tránh vòng lặp).
    if (pathname === "/login" || pathname === "/register") return;
    const returnUrl = safeReturnUrl(`${pathname}${search}${hash}`);
    const query = new URLSearchParams({ reason });
    if (returnUrl !== "/") query.set("returnUrl", returnUrl);
    window.location.assign(`/login?${query.toString()}`);
  }
}
export const authClient = new AuthClient();
// Gọi API cần JWT. 401 (thiếu/sai/hết hạn) => xóa phiên và chuyển về /login, rồi vẫn ném ApiError để nơi gọi dừng luồng.
export async function authorizedRequest<T>(
  path: string,
  options: Omit<RequestOptions, "token"> = {},
): Promise<T> {
  const session = loadSession();
  if (!session) {
    // Còn dữ liệu phiên nhưng không hợp lệ nữa (đã quá hạn) => "hết hạn"; chưa từng đăng nhập => "cần đăng nhập".
    authClient.handleSessionExpired(readRawSession() ? "expired" : "required");
    throw new ApiError("Cần đăng nhập để tiếp tục.", 401, "TOKEN_MISSING");
  }
  try {
    return await apiRequest<T>(path, {
      ...options,
      token: session.accessToken,
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401)
      authClient.handleSessionExpired("expired");
    throw error;
  }
}
