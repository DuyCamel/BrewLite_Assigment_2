// TV4 — Hết hạn đơn không phụ thuộc múi giờ: dù phiên DB đặt múi giờ nào, đơn mới tạo vẫn còn hạn ~15 phút,
// job không hủy nhầm đơn còn hạn, và vẫn hủy đúng đơn đã quá hạn.
// Phủ mục "tính sai expires_at / timezone dẫn đến hủy hàng loạt" trong phân công TV4.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { OrderModel } from "../src/models/order.model.js";
import { InventoryModel } from "../src/models/inventory.model.js";
import { PromotionModel } from "../src/models/promotion.model.js";
import { InventoryService } from "../src/services/inventory.service.js";
import { OrdersService } from "../src/services/orders.service.js";
import { PromotionsService } from "../src/services/promotions.service.js";
import {
  PRODUCT_ID,
  USER_ID,
  createTestDb,
  makeFakeDatabase,
  setStock,
} from "./tv4-helpers.js";

let db: PGlite;
let orders: OrdersService;

before(async () => {
  db = await createTestDb();
  orders = new OrdersService(
    makeFakeDatabase(db),
    new OrderModel(),
    new InventoryService(new InventoryModel()),
    new PromotionsService(new PromotionModel(makeFakeDatabase(db))),
  );
  // Dọn các đơn PENDING đã quá hạn sẵn trong dữ liệu seed để các assert đếm chỉ tính đơn của test.
  await orders.expirePendingOrders();
});
after(async () => {
  await db.close();
});

// Múi giờ lệch nhiều: UTC, Việt Nam (+7), Los Angeles (-7/-8), Kiritimati (+14).
const ZONES = ["UTC", "Asia/Ho_Chi_Minh", "America/Los_Angeles", "Pacific/Kiritimati"];

for (const zone of ZONES) {
  test(`múi giờ ${zone}: đơn mới còn hạn ~15 phút, job không hủy; đơn quá hạn thì bị hủy đúng`, async () => {
    await db.exec(`SET TIME ZONE '${zone}'`);
    await setStock(db, 10);

    const fresh = await orders.createOrder(USER_ID, {
      items: [{ productId: PRODUCT_ID, size: "S", toppingIds: [], quantity: 1 }],
    });
    const old = await orders.createOrder(USER_ID, {
      items: [{ productId: PRODUCT_ID, size: "S", toppingIds: [], quantity: 1 }],
    });

    // Hạn còn lại phải ~15 phút, bất kể múi giờ phiên.
    const left = await db.query<{ id: string; minutes: number }>(
      `SELECT id, extract(epoch from (expires_at - now())) / 60 AS minutes
         FROM orders WHERE id = ANY($1)`,
      [[fresh.orderId, old.orderId]],
    );
    for (const row of left.rows) {
      assert.ok(
        Number(row.minutes) > 14 && Number(row.minutes) <= 15,
        `${zone}: hạn còn ${row.minutes} phút, không nằm trong (14, 15]`,
      );
    }

    // Chưa đơn nào quá hạn nên job không được hủy đơn nào.
    assert.equal(await orders.expirePendingOrders(), 0, `${zone}: job hủy nhầm đơn còn hạn`);

    // Đưa đúng một đơn quá hạn (không đổi created_at vì trigger chặn).
    await db.query(
      `UPDATE orders
          SET expires_at = created_at + interval '1 millisecond',
              qr_expires_at = created_at + interval '1 millisecond'
        WHERE id = $1`,
      [old.orderId],
    );
    assert.equal(await orders.expirePendingOrders(), 1, `${zone}: phải hủy đúng 1 đơn`);

    const status = await db.query<{ id: string; status: string }>(
      "SELECT id, status FROM orders WHERE id = ANY($1)",
      [[fresh.orderId, old.orderId]],
    );
    const byId = new Map(status.rows.map((r) => [r.id, r.status]));
    assert.equal(byId.get(fresh.orderId), "PENDING");
    assert.equal(byId.get(old.orderId), "CANCELLED");

    await db.exec("RESET TIME ZONE");
  });
}