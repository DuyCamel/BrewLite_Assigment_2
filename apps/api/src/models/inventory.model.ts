// TV4 — Model Inventory: nơi viết SQL đọc/sửa tồn kho (cột stock, version của products).
// Không tự mở transaction; chỉ dùng PoolClient do service truyền vào.
import { ConflictException, Injectable } from "@nestjs/common";
import type { StockSnapshot } from "../types/order.types.js";
import type { PoolClient } from "../types/contracts.js";
import type { OrderLine } from "../types/contracts.js";

@Injectable()
export class InventoryModel {
  async reserveIngredients(
    items: OrderLine[],
    orderId: string,
    transaction: PoolClient,
  ): Promise<boolean> {
    const schema = await transaction.query<{ exists: boolean }>(
      "SELECT to_regclass('public.product_recipes') IS NOT NULL AS exists",
    );
    if (!schema.rows[0]?.exists) return false;
    const result = await transaction.query<{
      ingredientId: string;
      quantity: number;
    }>(
      `WITH requested AS (
         SELECT item->>'productId' AS product_id,
                item->>'size' AS size,
                item->'toppingIds' AS topping_ids,
                (item->>'quantity')::int AS line_quantity
         FROM jsonb_array_elements($1::jsonb) AS x(item)
       ),
       recipe_rows AS (
         SELECT r.ingredient_id AS "ingredientId",
                r.quantity * q.line_quantity AS quantity
         FROM requested q
         JOIN product_recipes r ON r.product_id = q.product_id AND r.size = q.size
         UNION ALL
         SELECT r.ingredient_id,
                r.quantity * q.line_quantity
         FROM requested q
         CROSS JOIN LATERAL jsonb_array_elements_text(q.topping_ids) topping_id
         JOIN topping_recipes r
           ON r.product_id = q.product_id AND r.topping_id = topping_id
       )
       SELECT "ingredientId", SUM(quantity)::int AS quantity
       FROM recipe_rows
       GROUP BY "ingredientId"`,
      [JSON.stringify(items)],
    );
    if (result.rows.length === 0) {
      throw new ConflictException(
        "Sản phẩm hoặc topping chưa có công thức nguyên liệu",
      );
    }

    for (const row of result.rows) {
      const updated = await transaction.query(
        `UPDATE ingredients
         SET stock = stock - $2, version = version + 1
         WHERE id = $1 AND stock >= $2`,
        [row.ingredientId, row.quantity],
      );
      if (updated.rowCount !== 1) {
        throw new ConflictException(
          `Nguyên liệu ${row.ingredientId} không đủ tồn kho`,
        );
      }
      await transaction.query(
        `INSERT INTO order_ingredient_reservations(order_id, ingredient_id, quantity)
         VALUES ($1, $2, $3)`,
        [orderId, row.ingredientId, row.quantity],
      );
    }
    return true;
  }

  // Khóa lạc quan: chỉ trừ khi đủ hàng và version chưa bị ai đổi. true = trừ được.
  async decreaseStock(
    productId: string,
    quantity: number,
    expectedVersion: number,
    transaction: PoolClient,
  ): Promise<boolean> {
    const result = await transaction.query(
      `UPDATE products
       SET stock = stock - $2, version = version + 1
       WHERE id = $1 AND stock >= $2 AND version = $3`,
      [productId, quantity, expectedVersion],
    );
    return result.rowCount === 1;
  }

  // Hoàn tồn đúng một lần nhờ cờ orders.stock_released. true = lần này vừa hoàn.
  async restoreStockOnce(
    orderId: string,
    transaction: PoolClient,
  ): Promise<boolean> {
    const marked = await transaction.query(
      `UPDATE orders
       SET stock_released = true
       WHERE id = $1 AND stock_released = false`,
      [orderId],
    );
    if (marked.rowCount !== 1) {
      return false; // đã có người hoàn trước đó
    }
    const schema = await transaction.query<{ exists: boolean }>(
      "SELECT to_regclass('public.order_ingredient_reservations') IS NOT NULL AS exists",
    );
    const ingredientResult = schema.rows[0]?.exists
      ? await transaction.query(
          `UPDATE ingredients i
       SET stock = i.stock + r.quantity, version = i.version + 1
       FROM order_ingredient_reservations r
       WHERE r.order_id = $1 AND r.ingredient_id = i.id`,
          [orderId],
        )
      : { rowCount: 0 };
    if (ingredientResult.rowCount && ingredientResult.rowCount > 0) {
      await transaction.query(
        "DELETE FROM order_ingredient_reservations WHERE order_id = $1",
        [orderId],
      );
      return true;
    }
    await transaction.query(
      `UPDATE products p
       SET stock = p.stock + r.qty, version = p.version + 1
       FROM (
         SELECT product_id, SUM(quantity) AS qty
         FROM order_items
         WHERE order_id = $1
         GROUP BY product_id
       ) r
       WHERE r.product_id = p.id`,
      [orderId],
    );
    return true;
  }

  async findStock(
    productId: string,
    transaction: PoolClient,
  ): Promise<StockSnapshot | null> {
    const result = await transaction.query(
      `SELECT stock, version
       FROM products
       WHERE id = $1`,
      [productId],
    );
    return (result.rows[0] as StockSnapshot) ?? null;
  }
}