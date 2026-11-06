// TV6 — Nghiệp vụ đọc đơn của khách: lịch sử + chi tiết. Không viết SQL ở đây (SQL ở CustomerOrderModel).
// userId PHẢI lấy từ JWT đã xác thực (TV3), không bao giờ từ body/query/URL.
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  CustomerOrderModel,
  type OrderSummaryRow,
} from "../models/customer-order.model.js";
import { OrderStateService } from "./order-state.service.js";
import type {
  OrderDetail,
  OrderListPage,
  OrderSummary,
} from "../types/customer-order.types.js";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MAX_ORDER_ID_LENGTH = 100;

function toIso(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function parseIntParam(
  raw: unknown,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  if (raw === undefined || raw === "") return fallback;
  const n = typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new BadRequestException(
      `${name} phải là số nguyên từ ${min} đến ${max}`,
    );
  }
  return n;
}

function toSummary(row: OrderSummaryRow): OrderSummary {
  return {
    id: row.id,
    paymentCode: row.payment_code,
    status: row.status,
    subtotal: row.subtotal,
    discount: row.discount,
    total: row.total,
    itemCount: row.item_count,
    paymentStatus: row.payment_status,
    createdAt: toIso(row.created_at),
    expiresAt: toIso(row.expires_at),
  };
}

@Injectable()
export class CustomerOrdersService {
  constructor(
    @Inject(CustomerOrderModel) private readonly orders: CustomerOrderModel,
    @Inject(OrderStateService) private readonly orderState: OrderStateService,
  ) {}

  /** GET /orders/me?limit=&offset= — đơn của chính user, mới nhất trước. */
  async getMyOrders(
    userId: string,
    rawLimit?: unknown,
    rawOffset?: unknown,
  ): Promise<OrderListPage> {
    const limit = parseIntParam(rawLimit, "limit", DEFAULT_LIMIT, 1, MAX_LIMIT);
    const offset = parseIntParam(rawOffset, "offset", 0, 0, 100000);
    // Lấy dư 1 dòng để biết còn trang sau hay không.
    const rows = await this.orders.findSummariesByUser(
      userId,
      limit + 1,
      offset,
    );
    return {
      orders: rows.slice(0, limit).map(toSummary),
      limit,
      offset,
      hasMore: rows.length > limit,
    };
  }

  /**
   * GET /orders/:id — chỉ chủ đơn. Đơn không tồn tại và đơn của người khác đều trả 404
   * (không lộ việc mã đơn đó có tồn tại).
   */
  async getOrderDetail(
    userId: string,
    rawOrderId: string,
  ): Promise<OrderDetail> {
    const orderId = (rawOrderId ?? "").trim();
    if (orderId === "" || orderId.length > MAX_ORDER_ID_LENGTH) {
      throw new BadRequestException("Mã đơn không hợp lệ");
    }
    const row = await this.orders.findDetailForUser(orderId, userId);
    if (!row) throw new NotFoundException("Không tìm thấy đơn hàng");

    const payments = row.payments.map((p) => ({
      ...p,
      createdAt: toIso(p.createdAt),
      resolvedAt: p.resolvedAt === null ? null : toIso(p.resolvedAt),
    }));
    const hasProcessing = payments.some((p) => p.status === "PROCESSING");

    return {
      id: row.id,
      paymentCode: row.payment_code,
      status: row.status,
      subtotal: row.subtotal,
      discount: row.discount,
      total: row.total,
      promotionCode: row.promotion_code,
      createdAt: toIso(row.created_at),
      expiresAt: toIso(row.expires_at),
      items: row.items,
      payments,
      pointsEarned: row.points_earned,
      canCancel: this.orderState.canCancel(row.status, hasProcessing),
      canRetryPayment: this.orderState.canRetryPayment(row.status),
    };
  }
}
