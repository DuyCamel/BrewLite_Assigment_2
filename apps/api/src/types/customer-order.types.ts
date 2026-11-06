// TV6 — Kiểu dữ liệu cho API đọc đơn của khách (GET /orders/me, GET /orders/:id).
// Không viết SQL ở đây. Frontend copy/đồng bộ sang frontend/src/types khi đổi response.
import type { OrderStatus } from "./contracts.js";

export type PaymentAttemptStatus = "PROCESSING" | "SUCCEEDED" | "FAILED";
export type PaymentMethod = "WALLET" | "CARD";

export interface OrderSummary {
  id: string;
  paymentCode: string;
  status: OrderStatus;
  subtotal: number;
  discount: number;
  total: number;
  itemCount: number;
  /** Trạng thái attempt thanh toán mới nhất; null nếu chưa có attempt. */
  paymentStatus: PaymentAttemptStatus | null;
  createdAt: string;
  expiresAt: string;
}

export interface OrderListPage {
  orders: OrderSummary[];
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface OrderItemView {
  id: string;
  productId: string;
  productName: string;
  size: string;
  toppingIds: string[];
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

/** Không có idempotency_key / payload_hash: đó là dữ liệu nội bộ, không trả cho client. */
export interface PaymentAttemptView {
  id: string;
  method: PaymentMethod;
  status: PaymentAttemptStatus;
  amount: number;
  createdAt: string;
  resolvedAt: string | null;
}

export interface OrderDetail {
  id: string;
  paymentCode: string;
  status: OrderStatus;
  subtotal: number;
  discount: number;
  total: number;
  promotionCode: string | null;
  createdAt: string;
  expiresAt: string;
  items: OrderItemView[];
  /** Mới nhất trước. */
  payments: PaymentAttemptView[];
  /** Điểm đã cộng cho đơn này (từ sổ điểm EARN); null nếu chưa có. */
  pointsEarned: number | null;
  /** Gợi ý cho UI. TV4 vẫn kiểm tra lại khi gọi POST /orders/:id/cancel. */
  canCancel: boolean;
  canRetryPayment: boolean;
}
