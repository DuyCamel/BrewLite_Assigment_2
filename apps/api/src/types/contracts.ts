// DTO/domain dự kiến — mỗi TV bổ sung class-validator; schema chung trong database/001_schema.sql, migration mới từ 004.
import type { PoolClient } from "pg";
export type { PoolClient };
export interface RegisterInput {
  email: string;
  password: string;
}
export interface LoginInput {
  email: string;
  password: string;
}
export interface StockItem {
  productId: string;
  quantity: number;
}
export interface OrderLine extends StockItem {
  size: string;
  toppingIds: string[];
}
export interface CreateOrderInput {
  items: OrderLine[];
  promotionCode?: string;
}
export interface PromotionInput {
  type: "PERCENT" | "FIXED";
  value: number;
}
export interface PaymentInput {
  orderId: string;
  method: "WALLET" | "CARD";
}
export type PaymentResult = "SUCCEEDED" | "FAILED" | "UNKNOWN";
export type OrderStatus =
  | "PENDING"
  | "PAYMENT_FAILED"
  | "PAID"
  | "PREPARING"
  | "READY"
  | "COMPLETED"
  | "CANCELLED";
