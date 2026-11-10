// TV4 — Cách ly giữa các đơn: thanh toán thành công một đơn, hoặc job hết hạn chạy, chỉ được ảnh hưởng đúng đơn liên quan.
// Phủ bug "đơn tự hủy khi thanh toán thành công / xem đơn": cùng một user có nhiều đơn PENDING thì đơn khác phải còn nguyên.
// Dùng model thật trên PostgreSQL (PGlite); cổng thanh toán là bản giả luôn trả SUCCESS.
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { OrderModel } from "../src/models/order.model.js";
import { InventoryModel } from "../src/models/inventory.model.js";
import { LoyaltyModel } from "../src/models/loyalty.model.js";
import { PaymentModel } from "../src/models/payment.model.js";
import { PromotionModel } from "../src/models/promotion.model.js";
import { InventoryService } from "../src/services/inventory.service.js";
import { LoyaltyService } from "../src/services/loyalty.service.js";
import { OrdersService } from "../src/services/orders.service.js";
import { PaymentsService } from "../src/services/payments.service.js";
import { PromotionsService } from "../src/services/promotions.service.js";
import type { MockPaymentGateway } from "../src/gateways/mock-payment.gateway.js";
import {
  PRODUCT_ID,
  USER_ID,
  createTestDb,
  makeFakeDatabase,
  readStock,
  setStock,
} from "./tv4-helpers.js";

let db: PGlite;
let orders: OrdersService;
let payments: PaymentsService;

before(async () => {
  db = await createTestDb();
  const fakeDb = makeFakeDatabase(db);
  const inventory = new InventoryService(new InventoryModel());
  const promotions = new PromotionsService(new PromotionModel(fakeDb));
  const orderModel = new OrderModel();
  orders = new OrdersService(fakeDb, orderModel, inventory, promotions);
  const gateway = {
    charge: async () => "SUCCESS",
    lookupByKey: async () => "SUCCESS",
  } as unknown as MockPaymentGateway;
  payments = new PaymentsService(
    fakeDb,
    new PaymentModel(fakeDb),
    orderModel,
    gateway,
    inventory,
    new LoyaltyService(new LoyaltyModel()),
  );
  // Dữ liệu seed có sẵn vài đơn PENDING đã quá hạn; cho job dọn trước để các assert đếm chỉ tính đơn của test.
  await orders.expirePendingOrders();
});
after(async () => {
  await db.close();
});
beforeEach(async () => {
  await setStock(db, 20);
});

const placeOrder = (userId = USER_ID, quantity = 1) =>
  orders.createOrder(userId, {
    items: [{ productId: PRODUCT_ID, size: "S", toppingIds: [], quantity }],
  });

async function statusOf(orderId: string): Promise<string> {
  const result = await db.query<{ status: string }>(
    "SELECT status FROM orders WHERE id = $1",
    [orderId],
  );
  return result.rows[0].status;
}

// Đẩy hạn của một đơn về quá khứ (created_at lùi theo để thỏa CHECK expires_at > created_at).
async function makeExpired(orderId: string) {
  // Không đổi created_at (trigger chặn); đặt hạn ngay sau created_at 1ms, thỏa CHECK expires_at > created_at và đã qua hạn.
  await db.query(
    `UPDATE orders
        SET expires_at = created_at + interval '1 millisecond',
            qr_expires_at = created_at + interval '1 millisecond'
      WHERE id = $1`,
    [orderId],
  );
}

test("thanh toán thành công một đơn: chỉ đơn đó PAID, các đơn PENDING khác của cùng user còn nguyên", async () => {
  const a = await placeOrder();
  const b = await placeOrder();
  const c = await placeOrder();
  assert.equal(await readStock(db), 17);

  await payments.createPayment(
    USER_ID,
    { orderId: a.orderId, method: "WALLET" },
    `iso-key-${a.orderId}`,
  );

  assert.equal(await statusOf(a.orderId), "PAID");
  assert.equal(await statusOf(b.orderId), "PENDING");
  assert.equal(await statusOf(c.orderId), "PENDING");
  // Tồn của hai đơn còn lại vẫn đang được giữ, không bị hoàn nhầm.
  assert.equal(await readStock(db), 17);

  // Job chạy ngay sau thanh toán: chưa đơn nào hết hạn nên không đơn nào bị hủy.
  assert.equal(await orders.expirePendingOrders(), 0);
  assert.equal(await statusOf(a.orderId), "PAID");
  assert.equal(await statusOf(b.orderId), "PENDING");
  assert.equal(await statusOf(c.orderId), "PENDING");
});

test("job hết hạn chỉ hủy đúng đơn đã quá hạn; đơn PAID, đơn còn hạn và đơn của user khác không bị đụng", async () => {
  const paid = await placeOrder();
  const expired = await placeOrder(USER_ID, 2);
  const alive = await placeOrder();
  const other = await placeOrder("demo-user-02");
  await payments.createPayment(
    USER_ID,
    { orderId: paid.orderId, method: "CARD" },
    `iso-key-${paid.orderId}`,
  );
  assert.equal(await readStock(db), 15);

  await makeExpired(expired.orderId);
  assert.equal(await orders.expirePendingOrders(), 1);

  assert.equal(await statusOf(expired.orderId), "CANCELLED");
  assert.equal(await statusOf(paid.orderId), "PAID");
  assert.equal(await statusOf(alive.orderId), "PENDING");
  assert.equal(await statusOf(other.orderId), "PENDING");
  // Đã giữ 5 ly (1+2+1+1) nên còn 15; hoàn đúng 2 ly của đơn hết hạn thì còn 17.
  assert.equal(await readStock(db), 17);
});

test("đơn đã PAID dù quá hạn cũng không bị job hủy (job chỉ xét đơn PENDING)", async () => {
  const paid = await placeOrder();
  await payments.createPayment(
    USER_ID,
    { orderId: paid.orderId, method: "WALLET" },
    `iso-key-${paid.orderId}`,
  );
  await makeExpired(paid.orderId);
  assert.equal(await orders.expirePendingOrders(), 0);
  assert.equal(await statusOf(paid.orderId), "PAID");
});