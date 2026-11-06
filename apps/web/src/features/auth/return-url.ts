// TV3 — Chuẩn hóa returnUrl sau đăng nhập. Chỉ nhận đường dẫn nội bộ của site để chống open redirect.
// Hàm thuần, không import gì từ framework nên dễ test.
const PLACEHOLDER_ORIGIN = "http://brewlite.invalid";
// Quay lại /login hay /register sau khi đăng nhập sẽ tạo vòng lặp.
const AUTH_PAGES = new Set(["/login", "/register"]);
function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}
export function safeReturnUrl(
  candidate: string | null | undefined,
  fallback = "/",
): string {
  if (!candidate || hasControlCharacter(candidate)) return fallback;
  // Chặn "//evil.com", "/\evil.com", "https://evil.com", "javascript:..." ngay từ dạng thô.
  if (
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\")
  )
    return fallback;
  let url: URL;
  try {
    url = new URL(candidate, PLACEHOLDER_ORIGIN);
  } catch {
    return fallback;
  }
  if (url.origin !== PLACEHOLDER_ORIGIN || AUTH_PAGES.has(url.pathname))
    return fallback;
  const normalized = `${url.pathname}${url.search}${url.hash}`;
  // Chuẩn hóa dấu chấm có thể biến "/.//evil.com" thành "//evil.com": kiểm tra lại sau khi chuẩn hóa.
  return normalized.startsWith("//") ? fallback : normalized;
}
