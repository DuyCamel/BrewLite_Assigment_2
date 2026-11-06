// TV3 — Lưu phiên đăng nhập trong localStorage của trình duyệt (key riêng, KHÔNG đụng key giỏ hàng của TV2).
// Lưu ý bảo mật: localStorage đọc được bởi script cùng origin; không render HTML thô từ dữ liệu người dùng (tránh XSS).
import type { AuthSession, PublicUser } from "@/types/auth";
export const SESSION_STORAGE_KEY = "brewlite.session";
export const SESSION_CHANGED_EVENT = "brewlite:session-changed";
export interface StoredSession {
  accessToken: string;
  // Thời điểm hết hạn tính bằng mili giây epoch, suy ra từ expiresIn do server trả.
  expiresAt: number;
  user: PublicUser;
}
export class SessionStorageError extends Error {
  constructor() {
    super(
      "Trình duyệt không cho lưu phiên đăng nhập. Tắt chế độ riêng tư hoặc cho phép lưu dữ liệu trang rồi thử lại.",
    );
    this.name = "SessionStorageError";
  }
}
function isPublicUser(value: unknown): value is PublicUser {
  if (typeof value !== "object" || value === null) return false;
  const user = value as Record<string, unknown>;
  return (
    typeof user.id === "string" &&
    typeof user.email === "string" &&
    typeof user.displayName === "string" &&
    typeof user.loyaltyPoints === "number"
  );
}
// Dữ liệu trong localStorage có thể bị sửa tay hoặc cũ: luôn kiểm tra hình dạng và hạn dùng trước khi tin.
export function parseSession(
  raw: string | null,
  now: number = Date.now(),
): StoredSession | null {
  if (!raw) return null;
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== "object" || data === null) return null;
    const { accessToken, expiresAt, user } = data as Record<string, unknown>;
    if (
      typeof accessToken !== "string" ||
      accessToken === "" ||
      typeof expiresAt !== "number" ||
      expiresAt <= now ||
      !isPublicUser(user)
    )
      return null;
    return { accessToken, expiresAt, user };
  } catch {
    return null;
  }
}
export function readRawSession(): string | null {
  try {
    return window.localStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}
function notifySessionChanged(): void {
  window.dispatchEvent(new Event(SESSION_CHANGED_EVENT));
}
export function loadSession(): StoredSession | null {
  if (typeof window === "undefined") return null;
  return parseSession(readRawSession());
}
export function saveSession(session: AuthSession): StoredSession {
  const stored: StoredSession = {
    accessToken: session.accessToken,
    expiresAt: Date.now() + session.expiresIn * 1000,
    user: session.user,
  };
  try {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    throw new SessionStorageError();
  }
  notifySessionChanged();
  return stored;
}
export function clearSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Không xóa được thì phiên vẫn sẽ bị bỏ qua khi hết hạn; không có gì thêm để làm.
  }
  notifySessionChanged();
}
