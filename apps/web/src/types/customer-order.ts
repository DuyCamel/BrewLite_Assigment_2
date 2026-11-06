// TV6 — Đồng bộ contract với backend/src/types/customer-order.types.ts. Tiền là số nguyên VNĐ.
// Đổi response ở backend thì sửa cả hai file cùng lúc.
export type OrderStatus =
  | "PENDING"
  | "PAYMENT_FAILED"
  | "PAID"
  | "PREPARING"
  | "READY"
  | "COMPLETED"
  | "CANCELLED";
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
  pointsEarned: number | null;
  canCancel: boolean;
  canRetryPayment: boolean;
}
