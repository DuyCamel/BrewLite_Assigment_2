// TV6 — SQL đọc đơn của khách + khóa/cập nhật trạng thái. Chỉ SQL tham số hóa, không quyết định HTTP.
// Quyền sở hữu nằm NGAY trong SQL (user_id = $n): đơn của người khác trả về như không tồn tại.
import { Inject, Injectable } from "@nestjs/common";
import type { QueryResultRow } from "pg";
import { DatabaseService } from "../config/db.js";
import type { OrderStatus, PoolClient } from "../types/contracts.js";
import type { PaymentAttemptStatus } from "../types/customer-order.types.js";

type Timestamp = Date | string;

export interface OrderSummaryRow {
  id: string;
  payment_code: string;
  status: OrderStatus;
  subtotal: number;
  discount: number;
  total: number;
  item_count: number;
  payment_status: PaymentAttemptStatus | null;
  created_at: Timestamp;
  expires_at: Timestamp;
}

export interface OrderDetailRow {
  id: string;
  payment_code: string;
  status: OrderStatus;
  subtotal: number;
  discount: number;
  total: number;
  promotion_code: string | null;
  created_at: Timestamp;
  expires_at: Timestamp;
  points_earned: number | null;
  // json_agg: đã đúng dạng camelCase theo json_build_object bên dưới.
  items: Array<{
    id: string;
    productId: string;
    productName: string;
    size: string;
    toppingIds: string[];
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  payments: Array<{
    id: string;
    method: "WALLET" | "CARD";
    status: PaymentAttemptStatus;
    amount: number;
    createdAt: string;
    resolvedAt: string | null;
  }>;
}

@Injectable()
export class CustomerOrderModel {
  // @Inject tường minh: dự án chạy bằng tsx, không có emitDecoratorMetadata.
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  // Chỗ DUY NHẤT gọi DatabaseService.query (config/db.ts).
  private async run<T extends QueryResultRow>(
    text: string,
    params: unknown[],
  ): Promise<T[]> {
    const result = await this.db.query<T>(text, params);
    return result.rows;
  }

  /** Lịch sử đơn của user, mới nhất trước. Dùng index orders_user_history. */
  findSummariesByUser(
    userId: string,
    limit: number,
    offset: number,
  ): Promise<OrderSummaryRow[]> {
    return this.run<OrderSummaryRow>(
      `SELECT o.id, o.payment_code, o.status, o.subtotal, o.discount, o.total,
              o.created_at, o.expires_at,
              (SELECT COALESCE(SUM(i.quantity), 0)::int
                 FROM order_items i WHERE i.order_id = o.id) AS item_count,
              (SELECT p.status FROM payments p
                WHERE p.order_id = o.id
                ORDER BY p.created_at DESC LIMIT 1) AS payment_status
         FROM orders o
        WHERE o.user_id = $1
        ORDER BY o.created_at DESC, o.id DESC
        LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
    );
  }

  /**
   * Chi tiết một đơn của user. MỘT câu SELECT => một snapshot nhất quán
   * (không thấy đơn PAID nhưng payment còn PROCESSING giữa hai truy vấn).
   * Trả undefined nếu đơn không tồn tại HOẶC không thuộc user.
   */
  async findDetailForUser(
    orderId: string,
    userId: string,
  ): Promise<OrderDetailRow | undefined> {
    const rows = await this.run<OrderDetailRow>(
      `SELECT o.id, o.payment_code, o.status, o.subtotal, o.discount, o.total,
              o.created_at, o.expires_at,
              (SELECT pr.code FROM promotions pr WHERE pr.id = o.promotion_id) AS promotion_code,
              (SELECT l.points FROM loyalty_transactions l
                WHERE l.order_id = o.id AND l.type = 'EARN') AS points_earned,
              COALESCE((SELECT json_agg(json_build_object(
                          'id', i.id,
                          'productId', i.product_id,
                          'productName', i.product_name,
                          'size', i.size,
                          'toppingIds', i.topping_ids,
                          'quantity', i.quantity,
                          'unitPrice', i.unit_price,
                          'lineTotal', i.line_total) ORDER BY i.id)
                        FROM order_items i WHERE i.order_id = o.id), '[]'::json) AS items,
              COALESCE((SELECT json_agg(json_build_object(
                          'id', p.id,
                          'method', p.method,
                          'status', p.status,
                          'amount', p.amount,
                          'createdAt', p.created_at,
                          'resolvedAt', p.resolved_at) ORDER BY p.created_at DESC)
                        FROM payments p WHERE p.order_id = o.id), '[]'::json) AS payments
         FROM orders o
        WHERE o.id = $1 AND o.user_id = $2`,
      [orderId, userId],
    );
    return rows[0];
  }

  // ---- Dùng cho OrderStateService.transitionOrder: luôn truyền PoolClient của transaction đang mở ----

  /** Khóa dòng đơn và đọc trạng thái hiện tại. undefined nếu không có đơn. */
  async lockStatus(
    client: PoolClient,
    orderId: string,
  ): Promise<OrderStatus | undefined> {
    const res = await client.query<{ status: OrderStatus }>(
      `SELECT status FROM orders WHERE id = $1 FOR UPDATE`,
      [orderId],
    );
    return res.rows[0]?.status;
  }

  /** Compare-and-set: chỉ đổi khi trạng thái vẫn là `from`. Trả true nếu đã đổi 1 dòng. */
  async updateStatus(
    client: PoolClient,
    orderId: string,
    from: OrderStatus,
    to: OrderStatus,
  ): Promise<boolean> {
    const res = await client.query(
      `UPDATE orders SET status = $3 WHERE id = $1 AND status = $2`,
      [orderId, from, to],
    );
    return res.rowCount === 1;
  }
}
