// TV6 — Hàm thuần: định dạng tiền/ngày, nhãn trạng thái, suy ra kết quả thanh toán từ đơn do backend trả.
import type {
  OrderDetail,
  OrderStatus,
  PaymentAttemptStatus,
  PaymentMethod,
} from "@/types/customer-order";

export function formatVnd(amount: number): string {
  return `${new Intl.NumberFormat("vi-VN").format(amount)}đ`;
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

/** Mã đơn ngắn gọn (8 ký tự cuối, in hoa) để khách đọc cho nhân viên. Đường dẫn và API vẫn dùng mã đầy đủ. */
export function shortOrderId(id: string): string {
  return id.length <= 12 ? id : id.slice(-8).toUpperCase();
}

export const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: "Chờ thanh toán",
  PAYMENT_FAILED: "Thanh toán thất bại",
  PAID: "Đã thanh toán",
  PREPARING: "Đang pha chế",
  READY: "Sẵn sàng nhận",
  COMPLETED: "Hoàn tất",
  CANCELLED: "Đã hủy",
};

export type StatusTone = "wait" | "bad" | "good" | "off";
export const STATUS_TONE: Record<OrderStatus, StatusTone> = {
  PENDING: "wait",
  PAYMENT_FAILED: "bad",
  PAID: "good",
  PREPARING: "good",
  READY: "good",
  COMPLETED: "good",
  CANCELLED: "off",
};

export const PAYMENT_STATUS_LABEL: Record<PaymentAttemptStatus, string> = {
  PROCESSING: "Đang xử lý",
  SUCCEEDED: "Thành công",
  FAILED: "Thất bại",
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  WALLET: "Ví",
  CARD: "Thẻ",
};

const PAID_STATUSES: ReadonlySet<OrderStatus> = new Set([
  "PAID",
  "PREPARING",
  "READY",
  "COMPLETED",
]);

export type PaymentOutcome =
  "SUCCESS" | "FAILED" | "PROCESSING" | "AWAITING_PAYMENT" | "CANCELLED";

/**
 * Kết quả thanh toán suy ra HOÀN TOÀN từ dữ liệu backend (không đọc status trên URL).
 * Chỉ SUCCESS khi đơn đã ở trạng thái đã trả tiền; timeout vẫn là PROCESSING, không coi là FAILED.
 */
export function derivePaymentOutcome(order: OrderDetail): PaymentOutcome {
  if (PAID_STATUSES.has(order.status)) return "SUCCESS";
  if (order.status === "CANCELLED") return "CANCELLED";
  if (order.payments[0]?.status === "PROCESSING") return "PROCESSING";
  if (order.status === "PAYMENT_FAILED") return "FAILED";
  return "AWAITING_PAYMENT";
}

/**
 * Còn phải hỏi lại backend không. Luồng SePay: khách chuyển khoản xong, webhook mới tạo payment (SUCCEEDED) và đổi
 * đơn sang PAID trong một transaction, nên trước đó đơn vẫn PENDING và CHƯA có dòng payment nào (AWAITING_PAYMENT).
 * Luồng cổng mô phỏng của TV5 thì có attempt PROCESSING. Cả hai đều phải tiếp tục polling.
 */
export function isStillWaiting(outcome: PaymentOutcome): boolean {
  return outcome === "PROCESSING" || outcome === "AWAITING_PAYMENT";
}

/** "tran-chau-den" → "tran chau den" (backend chỉ lưu mã topping, chưa lưu tên). */
export function humanizeId(id: string): string {
  return id.replace(/[-_]+/g, " ");
}
