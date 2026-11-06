// TV4 — Model Order: nơi viết SQL cho bảng orders và order_items. Không đặt logic nghiệp vụ/HTTP tại đây.
// Mọi hàm nhận PoolClient từ service để cùng nằm trong một transaction. SQL luôn tham số hóa.
import { Injectable } from "@nestjs/common";
import type {
  NewOrder,
  NewOrderItem,
  OrderRecord,
  OrderRow,
  ProductPricing,
} from "../types/order.types.js";
import type { PoolClient, OrderStatus, OrderLine } from "../types/contracts.js";

@Injectable()
export class OrderModel {
  async insertOrder(
    order: NewOrder,
    transaction: PoolClient,
  ): Promise<OrderRow> {
    const result = await transaction.query(
      `INSERT INTO orders (id, user_id, subtotal, discount, total, promotion_id, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, now() + interval '5 minutes')
        RETURNING id, payment_code AS "paymentCode", status, subtotal, discount, total, expires_at AS "expiresAt"`,
      [
        order.id,
        order.userId,
        order.subtotal,
        order.discount,
        order.total,
        order.promotionId,
      ],
    );
    return result.rows[0] as OrderRow;
  }

  // Phải gọi cùng client với insertOrder: DB 002 chặn ghi chi tiết sau khi đơn đã commit.
  async insertOrderItems(
    orderId: string,
    items: NewOrderItem[],
    transaction: PoolClient,
  ): Promise<void> {
    for (const item of items) {
      await transaction.query(
        `INSERT INTO order_items (id, order_id, product_id, product_name, size, topping_ids, quantity, unit_price, line_total)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)`,
        [
          item.id,
          orderId,
          item.productId,
          item.productName,
          item.size,
          JSON.stringify(item.toppingIds),
          item.quantity,
          item.unitPrice,
          item.lineTotal,
        ],
      );
    }
  }

  async findForUpdate(
    orderId: string,
    transaction: PoolClient,
  ): Promise<OrderRecord | null> {
    const result = await transaction.query(
      `SELECT id, user_id AS "userId", status, subtotal, discount, total,
              stock_released AS "stockReleased", expires_at AS "expiresAt"
       FROM orders
       WHERE id = $1
       FOR UPDATE`,
      [orderId],
    );
    return (result.rows[0] as OrderRecord) ?? null;
  }

  async updateStatus(
    orderId: string,
    from: OrderStatus,
    to: OrderStatus,
    transaction: PoolClient,
  ): Promise<boolean> {
    const result = await transaction.query(
      `UPDATE orders SET status = $3 WHERE id = $1 AND status = $2`,
      [orderId, from, to],
    );
    return result.rowCount === 1;
  }

  async findExpiredPendingOrders(transaction: PoolClient): Promise<string[]> {
    const result = await transaction.query(
      `SELECT o.id
       FROM orders o
       WHERE o.status = 'PENDING'
         AND o.expires_at < now()
         AND NOT EXISTS (
           SELECT 1
           FROM payments p
           WHERE p.status = 'PROCESSING'
             AND p.order_id = o.id
         )
       FOR UPDATE OF o SKIP LOCKED`,
    );
    return result.rows.map((row) => row.id);
  }

  async findForPricing(
    productIds: string[],
    transaction: PoolClient,
  ): Promise<ProductPricing[]> {
    const result = await transaction.query(
      `SELECT id, name, price, sizes, toppings
       FROM products
       WHERE id = ANY($1)`,
      [productIds],
    );
    return result.rows as ProductPricing[];
  }

  async hasProcessingPayment(
    orderId: string,
    transaction: PoolClient,
  ): Promise<boolean> {
    const result = await transaction.query(
      `SELECT 1
       FROM payments
       WHERE order_id = $1 AND status = 'PROCESSING'`,
      [orderId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async findItemsForStock(
    orderId: string,
    transaction: PoolClient,
  ): Promise<OrderLine[]> {
    const result = await transaction.query(
      `SELECT product_id AS "productId", quantity, size,
              topping_ids AS "toppingIds"
       FROM order_items
       WHERE order_id = $1`,
      [orderId],
    );
    return result.rows.map((row) => ({
      productId: row.productId,
      quantity: row.quantity,
      size: row.size,
      toppingIds: row.toppingIds,
    })) as OrderLine[];
  }

  async reopenForRetry(
    orderId: string,
    transaction: PoolClient,
  ): Promise<boolean> {
    const result = await transaction.query(
      `UPDATE orders
       SET status = 'PENDING',
           stock_released = false,
           expires_at = now() + interval '5 minutes'
       WHERE id = $1 AND status = 'PAYMENT_FAILED'`,
      [orderId],
    );
    return result.rowCount === 1;
  }
}
