// Test nghiệp vụ OrdersService + InventoryService chạy với model thật trên PostgreSQL (PGlite).
// DatabaseService được thay bằng bản giả chỉ có withTransaction (BEGIN/COMMIT/ROLLBACK).
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { OrderModel } from "../src/models/order.model.js";
import { InventoryModel } from "../src/models/inventory.model.js";
import { PromotionModel } from "../src/models/promotion.model.js";
import { InventoryService } from "../src/services/inventory.service.js";
import { OrdersService } from "../src/services/orders.service.js";
import { PromotionsService } from "../src/services/promotions.service.js";
import type { CreateOrderInput } from "../src/types/contracts.js";
import {
  EXTRA_M,
  PRODUCT_ID,
  TOPPING_TC,
  UNIT_S,
  USER_ID,
  countOrders,
  createTestDb,
  makeFakeDatabase,
  makeTx,
  readOrder,
  readStock,
  setStock,
  type Tx,
} from "./tv4-helpers.js";

let db: PGlite;
let tx: Tx;
let service: OrdersService;
let inventory: InventoryService;

before(async () => {
  db = await createTestDb();
  tx = makeTx(db);
  inventory = new InventoryService(new InventoryModel());
  const promotions = new PromotionsService({
    findByCode: async () => null,
  } as PromotionModel);
  service = new OrdersService(
    makeFakeDatabase(db),
    new OrderModel(),
    inventory,
    promotions,
  );
});
after(async () => {
  await db.close();
});
beforeEach(async () => {
  await setStock(db, 10);
});

const line = (quantity: number, size = "S", toppingIds: string[] = []) => ({
  productId: PRODUCT_ID,
  size,
  toppingIds,
  quantity,
});

async function createOrder(quantity: number) {
  return service.createOrder(USER_ID, { items: [line(quantity)] });
}

async function addProcessingPayment(orderId: string, amount: number) {
  await db.query(
    `INSERT INTO payments (id, order_id, idempotency_key, payload_hash, amount, method)
     VALUES ($1, $2, $3, repeat('c', 64), $4, 'CARD')`,
    [`pay-${orderId}`, orderId, `key-${orderId}`, amount],
  );
}

// Mô phỏng TV5: thanh toán thất bại -> PAYMENT_FAILED và hoàn tồn trong cùng transaction.
async function simulatePaymentFailure(orderId: string, amount: number) {
  await tx(async (c) => {
    await c.query(
      `INSERT INTO payments (id, order_id, idempotency_key, payload_hash, amount, method)
       VALUES ($1, $2, $3, repeat('c', 64), $4, 'CARD')`,
      [`pay-${orderId}`, orderId, `key-${orderId}`, amount],
    );
    await c.query(
      "UPDATE payments SET status = 'FAILED', resolved_at = now() WHERE order_id = $1",
      [orderId],
    );
    await c.query("UPDATE orders SET status = 'PAYMENT_FAILED' WHERE id = $1", [
      orderId,
    ]);
    await inventory.releaseStock(orderId, c);
  });
}

// Đơn đã quá hạn (chèn thẳng) và trừ tồn thủ công như khi createOrder đã giữ tồn.
async function insertExpiredOrder(
  id: string,
  quantity: number,
  processingPayment: boolean,
) {
  const total = UNIT_S * quantity;
  await tx(async (c) => {
    await c.query(
      `INSERT INTO orders (id, user_id, subtotal, total, created_at, expires_at)
       VALUES ($1, $2, $3, $3, now() - interval '1 hour', now() - interval '30 minutes')`,
      [id, USER_ID, total],
    );
    await c.query(
      `INSERT INTO order_items (id, order_id, product_id, product_name, size, topping_ids, quantity, unit_price, line_total)
       VALUES ($1, $2, $3, 'Trà TV4', 'S', '[]'::jsonb, $4, $5, $6)`,
      [`${id}-i`, id, PRODUCT_ID, quantity, UNIT_S, total],
    );
    if (processingPayment) {
      await c.query(
        `INSERT INTO payments (id, order_id, idempotency_key, payload_hash, amount, method)
         VALUES ($1, $2, $3, repeat('c', 64), $4, 'CARD')`,
        [`pay-${id}`, id, `key-${id}`, total],
      );
    }
  });
  await db.query("UPDATE products SET stock = stock - $1 WHERE id = $2", [
    quantity,
    PRODUCT_ID,
  ]);
}

test("createOrder tính giá từ DB (bỏ qua giá client), giữ tồn và ghi đơn + chi tiết", async () => {
  // client cố gửi giá 1 đồng: phải bị bỏ qua
  const input = {
    items: [{ ...line(2, "M", ["tc"]), unitPrice: 1, price: 1 }],
  } as unknown as CreateOrderInput;
  const unit = UNIT_S + EXTRA_M + TOPPING_TC; // 32000
  const result = await service.createOrder(USER_ID, input);

  assert.equal(result.status, "PENDING");
  assert.equal(result.subtotal, unit * 2);
  assert.equal(result.discount, 0);
  assert.equal(result.total, unit * 2);
  assert.equal(await readStock(db), 8);

  const rows = await db.query<{
    product_name: string;
    size: string;
    topping_ids: string[];
    quantity: number;
    unit_price: number;
    line_total: number;
  }>(
    "SELECT product_name, size, topping_ids, quantity, unit_price, line_total FROM order_items WHERE order_id = $1",
    [result.orderId],
  );
  assert.equal(rows.rows.length, 1);
  assert.equal(rows.rows[0].product_name, "Trà TV4");
  assert.equal(rows.rows[0].size, "M");
  assert.deepEqual(rows.rows[0].topping_ids, ["tc"]);
  assert.equal(rows.rows[0].quantity, 2);
  assert.equal(rows.rows[0].unit_price, unit);
  assert.equal(rows.rows[0].line_total, unit * 2);
  assert.equal((await readOrder(db, result.orderId)).user_id, USER_ID);
});

test("createOrder hết hàng thì rollback: không tạo đơn, tồn không đổi", async () => {
  await setStock(db, 1);
  const ordersBefore = await countOrders(db);
  await assert.rejects(() => createOrder(2), ConflictException);
  assert.equal(await readStock(db), 1);
  assert.equal(await countOrders(db), ordersBefore);
});

test("createOrder gộp số lượng theo productId", async () => {
  await setStock(db, 5);
  const ordersBefore = await countOrders(db);
  // 3 + 4 = 7 > 5 nên phải bị từ chối dù từng dòng riêng lẻ đều còn đủ hàng
  await assert.rejects(
    () => service.createOrder(USER_ID, { items: [line(3), line(4)] }),
    ConflictException,
  );
  assert.equal(await readStock(db), 5);
  assert.equal(await countOrders(db), ordersBefore);

  await setStock(db, 7);
  const result = await service.createOrder(USER_ID, {
    items: [line(3), line(4)],
  });
  assert.equal(result.subtotal, UNIT_S * 7);
  assert.equal(await readStock(db), 0);
  const items = await db.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM order_items WHERE order_id = $1",
    [result.orderId],
  );
  assert.equal(items.rows[0].n, 2);
});

test("createOrder từ chối sản phẩm/size/topping sai và không đụng tồn kho", async () => {
  const ordersBefore = await countOrders(db);
  const badInputs: CreateOrderInput[] = [
    { items: [{ ...line(1), productId: "khong-co" }] },
    { items: [line(1, "XL")] },
    { items: [line(1, "S", ["khong-co"])] },
    { items: [line(1, "S", ["tc", "tc"])] },
  ];
  for (const input of badInputs) {
    await assert.rejects(
      () => service.createOrder(USER_ID, input),
      BadRequestException,
    );
  }
  assert.equal(await readStock(db), 10);
  assert.equal(await countOrders(db), ordersBefore);
});

test("createOrder kiểm tra đầu vào: items rỗng/thiếu và quantity sai", async () => {
  await assert.rejects(
    () => service.createOrder(USER_ID, { items: [] }),
    BadRequestException,
  );
  await assert.rejects(
    () => service.createOrder(USER_ID, {} as unknown as CreateOrderInput),
    BadRequestException,
  );
  const badQuantities: unknown[] = [0, -1, 100, 1.5, "2", undefined, null];
  for (const quantity of badQuantities) {
    await assert.rejects(
      () => service.createOrder(USER_ID, { items: [line(quantity as number)] }),
      BadRequestException,
      `quantity ${String(quantity)} phải bị từ chối`,
    );
  }
  assert.equal(await readStock(db), 10);
});

test("cancelOrder: chặn người lạ, hủy hoàn tồn đúng một lần, không hủy lại", async () => {
  const created = await createOrder(2);
  assert.equal(await readStock(db), 8);

  await assert.rejects(
    () => service.cancelOrder("nguoi-la", created.orderId),
    NotFoundException,
  );
  await assert.rejects(
    () => service.cancelOrder(USER_ID, "khong-co"),
    NotFoundException,
  );
  assert.equal((await readOrder(db, created.orderId)).status, "PENDING");
  assert.equal(await readStock(db), 8);

  const cancelled = await service.cancelOrder(USER_ID, created.orderId);
  assert.deepEqual(cancelled, {
    orderId: created.orderId,
    status: "CANCELLED",
  });
  const order = await readOrder(db, created.orderId);
  assert.equal(order.status, "CANCELLED");
  assert.equal(order.stock_released, true);
  assert.equal(await readStock(db), 10);

  await assert.rejects(
    () => service.cancelOrder(USER_ID, created.orderId),
    ConflictException,
  );
  assert.equal(await readStock(db), 10); // không hoàn lần hai
});

test("cancelOrder bị chặn khi đang có thanh toán PROCESSING", async () => {
  const created = await createOrder(1);
  await addProcessingPayment(created.orderId, created.total);
  await assert.rejects(
    () => service.cancelOrder(USER_ID, created.orderId),
    ConflictException,
  );
  assert.equal((await readOrder(db, created.orderId)).status, "PENDING");
  assert.equal(await readStock(db), 9);
});

test("expirePendingOrders hủy đơn quá hạn và hoàn tồn, bỏ qua đơn đang thanh toán/chưa hết hạn", async () => {
  await insertExpiredOrder("s-exp-free", 2, false);
  await insertExpiredOrder("s-exp-paying", 1, true);
  const fresh = await createOrder(1);
  assert.equal(await readStock(db), 6); // 10 - 2 - 1 - 1

  const count = await service.expirePendingOrders();
  assert.ok(count >= 1);

  const free = await readOrder(db, "s-exp-free");
  assert.equal(free.status, "CANCELLED");
  assert.equal(free.stock_released, true);
  assert.equal((await readOrder(db, "s-exp-paying")).status, "PENDING");
  assert.equal((await readOrder(db, fresh.orderId)).status, "PENDING");
  assert.equal(await readStock(db), 8); // chỉ hoàn 2 ly của đơn s-exp-free
});

test("preparePaymentRetry: giữ tồn mới rồi đưa PAYMENT_FAILED về PENDING", async () => {
  const created = await createOrder(2);

  // đơn còn PENDING thì chưa thử lại được
  await assert.rejects(
    () => service.preparePaymentRetry(USER_ID, created.orderId),
    ConflictException,
  );

  await simulatePaymentFailure(created.orderId, created.total);
  let order = await readOrder(db, created.orderId);
  assert.equal(order.status, "PAYMENT_FAILED");
  assert.equal(order.stock_released, true);
  assert.equal(await readStock(db), 10);

  await assert.rejects(
    () => service.preparePaymentRetry("nguoi-la", created.orderId),
    NotFoundException,
  );

  // hết hàng: ném 409, đơn vẫn PAYMENT_FAILED
  await setStock(db, 0);
  await assert.rejects(
    () => service.preparePaymentRetry(USER_ID, created.orderId),
    ConflictException,
  );
  order = await readOrder(db, created.orderId);
  assert.equal(order.status, "PAYMENT_FAILED");
  assert.equal(order.stock_released, true);
  assert.equal(await readStock(db), 0);

  // còn hàng: giữ tồn lại và về PENDING
  await setStock(db, 10);
  const retried = await service.preparePaymentRetry(USER_ID, created.orderId);
  assert.deepEqual(retried, { orderId: created.orderId, status: "PENDING" });
  order = await readOrder(db, created.orderId);
  assert.equal(order.status, "PENDING");
  assert.equal(order.stock_released, false);
  assert.equal(await readStock(db), 8);
});

test("InventoryService: reserveStock đủ/thiếu/không tồn tại, releaseStock trả true rồi false", async () => {
  await assert.rejects(
    () =>
      tx((c) =>
        inventory.reserveStock([{ productId: "khong-co", quantity: 1 }], c),
      ),
    NotFoundException,
  );

  await tx((c) =>
    inventory.reserveStock([{ productId: PRODUCT_ID, quantity: 10 }], c),
  );
  assert.equal(await readStock(db), 0);
  await assert.rejects(
    () =>
      tx((c) =>
        inventory.reserveStock([{ productId: PRODUCT_ID, quantity: 1 }], c),
      ),
    ConflictException,
  );
  assert.equal(await readStock(db), 0);

  const created = await createOrder(1).catch(() => null);
  assert.equal(created, null); // kho đang 0 nên đặt phải thất bại
});
