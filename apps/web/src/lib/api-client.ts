// TV3 — HTTP client chạy trong TRÌNH DUYỆT, gọi thẳng API NestJS (backend đã bật CORS cho FRONTEND_ORIGIN).
// Chỉ chứa URL công khai: không bao giờ đặt DB_PASSWORD/JWT_SECRET ở đây (xem src/lib/api.ts cho client phía server).
export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000"
).replace(/\/+$/, "");
const REQUEST_TIMEOUT_MS = 10_000;
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly fieldErrors?: Record<string, string>;
  constructor(
    message: string,
    status: number,
    code?: string,
    fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}
export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  token?: string | null;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function fallbackMessage(status: number): string {
  if (status >= 500) return "Máy chủ đang gặp sự cố. Thử lại sau ít phút.";
  if (status === 404) return "Không tìm thấy nội dung yêu cầu.";
  return `Yêu cầu không thành công (mã ${status}).`;
}
function toApiError(status: number, payload: unknown): ApiError {
  const body = isRecord(payload) ? payload : {};
  const message =
    typeof body.message === "string"
      ? body.message
      : Array.isArray(body.message)
        ? body.message
            .filter((m): m is string => typeof m === "string")
            .join(" ")
        : "";
  const code = typeof body.code === "string" ? body.code : undefined;
  const fieldErrors = isRecord(body.errors)
    ? Object.fromEntries(
        Object.entries(body.errors).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      )
    : undefined;
  return new ApiError(
    message || fallbackMessage(status),
    status,
    code,
    fieldErrors,
  );
}
export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...options.headers,
  };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? "GET",
      headers,
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    throw new ApiError(
      "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.",
      0,
      "NETWORK_ERROR",
    );
  }
  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }
  if (!response.ok) throw toApiError(response.status, payload);
  return payload as T;
}
