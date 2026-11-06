// TV3 — Nhận diện lỗi PostgreSQL ở tầng model. Service dùng để đổi lỗi DB thành mã HTTP phù hợp (TV5 cũng dùng được cho idempotency key).
// Mã 23505 = unique_violation.
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "23505"
  );
}
