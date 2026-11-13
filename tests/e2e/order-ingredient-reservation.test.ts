import assert from "node:assert/strict";
import { after, test } from "node:test";
import { InventoryModel } from "../../apps/api/src/models/inventory.model.js";
import { OrderModel } from "../../apps/api/src/models/order.model.js";
import { PromotionModel } from "../../apps/api/src/models/promotion.model.js";
import { InventoryService } from "../../apps/api/src/services/inventory.service.js";
import { OrdersService } from "../../apps/api/src/services/orders.service.js";
import { PromotionsService } from "../../apps/api/src/services/promotions.service.js";
import {
  PRODUCT_ID,
  PRODUCT_INGREDIENT_ID,
  USER_ID,
  createTestDb,
  makeFakeDatabase,
} from "../../apps/api/test/tv4-helpers.js";

const db = await createTestDb();

const orders = new OrdersService(
  makeFakeDatabase(db),
  new OrderModel(),
  new InventoryService(new InventoryModel()),
  new PromotionsService({ findByCode: async () => null } as PromotionModel),
);

after(async () => {
  await db.close();
});

test("createOrder tạo đơn trước reservation nguyên liệu có khóa ngoại tới đơn", async () => {
  const result = await orders.createOrder(USER_ID, {
    items: [{ productId: PRODUCT_ID, size: "S", toppingIds: [], quantity: 1 }],
  });

  const reservation = await db.query<{
    ingredient_id: string;
    quantity: number;
  }>(
    `SELECT ingredient_id, quantity
     FROM order_ingredient_reservations
     WHERE order_id = $1`,
    [result.orderId],
  );
  assert.equal(reservation.rows.length, 1);
  assert.equal(reservation.rows[0].ingredient_id, PRODUCT_INGREDIENT_ID);
  assert.equal(reservation.rows[0].quantity, 1);

  const ingredient = await db.query<{ stock: number }>(
    "SELECT stock FROM ingredients WHERE id = $1",
    [reservation.rows[0].ingredient_id],
  );
  assert.equal(ingredient.rows[0].stock, 9);
});