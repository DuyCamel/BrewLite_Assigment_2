// TV4 — Model Inventory: nơi viết SQL đọc/sửa tồn kho nguyên liệu.
// Không tự mở transaction; chỉ dùng PoolClient do service truyền vào.
import { ConflictException, Injectable } from "@nestjs/common";
import type { PoolClient } from "../types/contracts.js";
import type { OrderLine } from "../types/contracts.js";

@Injectable()
export class InventoryModel {
  async reserveIngredients(
    items: OrderLine[],
    orderId: string,
    transaction: PoolClient,
  ): Promise<void> {
    const invalidRecipe = await transaction.query<{ invalid: boolean }>(
      `WITH requested AS (
         SELECT item->>'productId' AS product_id,
                item->>'size' AS size,
                item->'toppingIds' AS topping_ids
         FROM jsonb_array_elements($1::jsonb) AS x(item)
       ),
       missing_product_recipes AS (
         SELECT 1
         FROM requested q
         WHERE NOT EXISTS (
           SELECT 1
           FROM product_recipes r
           WHERE r.product_id = q.product_id AND r.size = q.size
         )
       ),
       missing_topping_recipes AS (
         SELECT 1
         FROM requested q
         CROSS JOIN LATERAL jsonb_array_elements_text(q.topping_ids) AS topping(topping_id)
         WHERE NOT EXISTS (
           SELECT 1
           FROM topping_recipes r
           WHERE r.product_id = q.product_id AND r.topping_id = topping.topping_id
         )
       )
       SELECT EXISTS (
         SELECT 1 FROM missing_product_recipes
         UNION ALL
         SELECT 1 FROM missing_topping_recipes
       ) AS invalid`,
      [JSON.stringify(items)],
    );
    if (invalidRecipe.rows[0]?.invalid) {
      throw new ConflictException(
        "Sản phẩm hoặc topping chưa có công thức nguyên liệu",
      );
    }

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
       GROUP BY "ingredientId"
       ORDER BY "ingredientId"`,
      [JSON.stringify(items)],
    );
    if (result.rows.length === 0) {
      throw new ConflictException(
        "Sản phẩm hoặc topping chưa có công thức nguyên liệu",
      );
    }

    for (const row of result.rows) {
      let reserved = false;
      while (!reserved) {
        const current = await transaction.query<{
          stock: number;
          version: number;
        }>("SELECT stock, version FROM ingredients WHERE id = $1", [
          row.ingredientId,
        ]);
        const snapshot = current.rows[0];
        if (!snapshot || snapshot.stock < row.quantity) {
          throw new ConflictException(
            `Nguyên liệu ${row.ingredientId} không đủ tồn kho`,
          );
        }
        const updated = await transaction.query(
          `UPDATE ingredients
           SET stock = stock - $2, version = version + 1
           WHERE id = $1 AND stock >= $2 AND version = $3`,
          [row.ingredientId, row.quantity, snapshot.version],
        );
        if (updated.rowCount === 1) {
          reserved = true;
        }
      }
      await transaction.query(
        `INSERT INTO order_ingredient_reservations(order_id, ingredient_id, quantity)
         VALUES ($1, $2, $3)`,
        [orderId, row.ingredientId, row.quantity],
      );
    }
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
    const reservations = await transaction.query<{
      ingredientId: string;
      quantity: number;
    }>(
      `SELECT ingredient_id AS "ingredientId", quantity
       FROM order_ingredient_reservations
       WHERE order_id = $1
       ORDER BY ingredient_id`,
      [orderId],
    );
    for (const reservation of reservations.rows) {
      await transaction.query(
        `UPDATE ingredients
         SET stock = stock + $2, version = version + 1
         WHERE id = $1`,
        [reservation.ingredientId, reservation.quantity],
      );
    }
    await transaction.query(
      "DELETE FROM order_ingredient_reservations WHERE order_id = $1",
      [orderId],
    );
    return true;
  }
}