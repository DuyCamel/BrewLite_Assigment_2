// TV6 — Gọi backend TỪ TRÌNH DUYỆT (lib/api.ts hiện chỉ dùng phía server). Không viết SQL/secret ở đây.
// Mọi request đi qua request(). Token lấy từ phiên đăng nhập của TV3 (getAccessToken).
import type { OrderDetail,OrderListPage} from "@/types/customer-order";
import { clearSession, loadSession } from "@/features/auth/session";

// Cần cấu hình khi build production (Docker/CD): NEXT_PUBLIC_API_BASE_URL=https://<api>.
const API_BASE = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000"
).replace(/\/+$/, "");

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// TV3: JWT lấy từ phiên đăng nhập (localStorage, key brewlite.session, xem features/auth/session.ts).
// Chưa đăng nhập hoặc phiên đã quá hạn → null → backend trả 401 → UI hiện lời nhắc đăng nhập.
function getAccessToken(): string | null {
  return loadSession()?.accessToken ?? null;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function messageFromBody(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const message = (body as { message?: unknown }).message;
  if (typeof message === "string") return message;
  if (Array.isArray(message)) return message.filter((m) => typeof m === "string").join(", ");
  return null;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  const token = getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers,
      cache: "no-store",
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new ApiError(0, "Không kết nối được máy chủ");
  }

  const text = await response.text();
  let body: unknown = undefined;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      if (response.ok) throw new ApiError(502, "Phản hồi từ máy chủ không hợp lệ");
    }
  }
  // Server từ chối token (hết hạn/không hợp lệ): xóa phiên để header và trang khớp nhau về trạng thái đăng nhập.
  if (response.status === 401 && token) clearSession();
  if (!response.ok) {
    throw new ApiError(
      response.status,
      messageFromBody(body) ?? `Lỗi ${response.status}`,
    );
  }
  return body as T;
}

export function fetchMyOrders(
  { limit, offset }: { limit: number; offset: number },
  signal?: AbortSignal,
): Promise<OrderListPage> {
  return request<OrderListPage>(`/orders/me?limit=${limit}&offset=${offset}`, {
    signal,
  });
}

export function fetchOrderDetail(
  orderId: string,
  signal?: AbortSignal,
): Promise<OrderDetail> {
  return request<OrderDetail>(`/orders/${encodeURIComponent(orderId)}`, {
    signal,
  });
}

// API của TV4; hiện có thể trả 501. UI luôn tải lại trạng thái thật sau khi gọi.
export function cancelOrder(orderId: string): Promise<unknown> {
  return request<unknown>(`/orders/${encodeURIComponent(orderId)}/cancel`, {
    method: "POST",
  });
}

export function retryOrderPayment(orderId: string): Promise<unknown> {
  return request<unknown>(
    `/orders/${encodeURIComponent(orderId)}/retry-payment`,
    { method: "POST" },
  );
}

export function reconcilePayment(paymentId: string): Promise<unknown> {
  return request<unknown>(
    `/payments/${encodeURIComponent(paymentId)}/reconcile`,
    { method: "POST" },
  );
}

/** Thông báo thân thiện cho người dùng; không lộ chi tiết lỗi máy chủ. */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 0) return "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.";
    if (error.status === 501) return "Chức năng này chưa sẵn sàng.";
    if (error.status >= 500) return "Máy chủ đang gặp sự cố, vui lòng thử lại sau.";
    return error.message;
  }
  return "Có lỗi xảy ra, vui lòng thử lại.";
}

export type LoadFailure =
  | { kind: "unauthorized" }
  | { kind: "notfound" }
  | { kind: "error"; message: string };

export function toFailure(error: unknown): LoadFailure {
  if (error instanceof ApiError && error.status === 401)
    return { kind: "unauthorized" };
  if (error instanceof ApiError && error.status === 404)
    return { kind: "notfound" };
  return { kind: "error", message: describeError(error) };
}
