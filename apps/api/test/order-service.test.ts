// Test nghiệp vụ OrdersService + InventoryService + khuyến mãi (TV1) với model thật trên PostgreSQL (PGlite).
// DatabaseService được thay bằng bản giả có withTransaction (BEGIN/COMMIT/ROLLBACK) và query.
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
  insertPromotion,
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
  const fakeDb = makeFakeDatabase(db);
  inventory = new InventoryService(new InventoryModel());
  const promotions = new PromotionsService(new PromotionModel(fakeDb));
  service = new OrdersService(fakeDb, new OrderModel(), inventory, promotions);

  // Khuyến mãi riêng của test, không phụ thuộc dữ liệu mẫu của TV1.
  await insertPromotion(db, { id: "tv4-promo-pct", code: "TV4PCT10", type: "PERCENT", value: 10 });
  await insertPromotion(db, { id: "tv4-promo-fix", code: "TV4FIX5K", type: "FIXED", value: 5000 });
  await insertPromotion(db, { id: "tv4-promo-big", code: "TV4BIG", type: "FIXED", value: 999999 });
  await insertPromotion(db, {
    id: "tv4-promo-min",
    code: "TV4MIN100K",
    type: "FIXED",
    value: 5000,
    minimumAmount: 100000,
  });
  await insertPromotion(db, {
    id: "tv4-promo-old",
    code: "TV4OLD",
    type: "PERCENT",
    value: 10,
    startsHoursFromNow: -48,
    endsHoursFromNow: -24,
  });
  await insertPromotion(db, {
    id: "tv4-promo-future",
    code: "TV4FUTURE",
    type: "PERCENT",
    value: 10,
    startsHoursFromNow: 24,
    endsHoursFromNow: 48,
  });
  await insertPromotion(db, {
    id: "tv4-promo-off",
    code: "TV4OFF",
    type: "PERCENT",
    value: 10,
    active: false,
  });
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

async function readPricing(orderId: string) {
  const result = await db.query<{
    discount: number;
    total: number;
    promotion_id: string | null;
  }>("SELECT discount, total, promotion_id FROM orders WHERE id = $1", [orderId]);
  return result.rows[0];
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
  // Tồn nay nằm ở nguyên liệu: trừ nguyên liệu và ghi bản giữ chỗ để releaseStock hoàn lại đúng.
  const ingredientId = `test-ingredient-${PRODUCT_ID}`;
  await db.query("UPDATE ingredients SET stock = stock - $1 WHERE id = $2", [
    quantity,
    ingredientId,
  ]);
  await db.query(
    "INSERT INTO order_ingredient_reservations (order_id, ingredient_id, quantity) VALUES ($1, $2, $3)",
    [id, ingredientId, quantity],
  );
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

test("createOrder áp mã PERCENT: chuẩn hóa mã, giảm theo %, lưu promotion_id", async () => {
  const subtotal = UNIT_S * 2;
  const discount = Math.floor((subtotal * 10) / 100);
  const result = await service.createOrder(USER_ID, {
    items: [line(2)],
    promotionCode: " tv4pct10 ", // khác hoa thường và có khoảng trắng
  });

  assert.equal(result.subtotal, subtotal);
  assert.equal(result.discount, discount);
  assert.equal(result.total, subtotal - discount);
  const saved = await readPricing(result.orderId);
  assert.equal(saved.discount, discount);
  assert.equal(saved.total, subtotal - discount);
  assert.equal(saved.promotion_id, "tv4-promo-pct");
  assert.equal(await readStock(db), 8);
});

test("createOrder áp mã FIXED và giảm không vượt subtotal", async () => {
  const fixed = await service.createOrder(USER_ID, {
    items: [line(2)],
    promotionCode: "TV4FIX5K",
  });
  assert.equal(fixed.discount, 5000);
  assert.equal(fixed.total, UNIT_S * 2 - 5000);
  assert.equal((await readPricing(fixed.orderId)).promotion_id, "tv4-promo-fix");

  const big = await service.createOrder(USER_ID, {
    items: [line(1)],
    promotionCode: "TV4BIG",
  });
  assert.equal(big.discount, UNIT_S); // bị chặn ở subtotal
  assert.equal(big.total, 0);
});

test("createOrder: mã có mức đơn tối thiểu", async () => {
  const ordersBefore = await countOrders(db);
  await assert.rejects(
    () => service.createOrder(USER_ID, { items: [line(2)], promotionCode: "TV4MIN100K" }),
    BadRequestException,
  );
  assert.equal(await readStock(db), 10);
  assert.equal(await countOrders(db), ordersBefore);

  // 5 ly x 20000 = 100000, đúng bằng mức tối thiểu nên được áp
  const ok = await service.createOrder(USER_ID, {
    items: [line(5)],
    promotionCode: "TV4MIN100K",
  });
  assert.equal(ok.subtotal, 100000);
  assert.equal(ok.discount, 5000);
  assert.equal(ok.total, 95000);
});

test("createOrder từ chối mã không tồn tại, hết hạn, chưa tới hạn, đã tắt, và không đụng tồn kho", async () => {
  const ordersBefore = await countOrders(db);
  for (const code of ["KHONG-TON-TAI", "TV4OLD", "TV4FUTURE", "TV4OFF"]) {
    await assert.rejects(
      () => service.createOrder(USER_ID, { items: [line(1)], promotionCode: code }),
      BadRequestException,
      `mã ${code} phải bị từ chối`,
    );
  }
  assert.equal(await readStock(db), 10);
  assert.equal(await countOrders(db), ordersBefore);
});

test("createOrder: không mã/mã rỗng thì không giảm giá, client không tự ép được giảm giá", async () => {
  const input = {
    items: [line(1)],
    promotionCode: "   ",
    discount: 99999,
    promotionId: "tv4-promo-big",
  } as unknown as CreateOrderInput;
  const result = await service.createOrder(USER_ID, input);
  assert.equal(result.discount, 0);
  assert.equal(result.total, UNIT_S);
  assert.equal((await readPricing(result.orderId)).promotion_id, null);

  await assert.rejects(
    () =>
      service.createOrder(USER_ID, {
        items: [line(1)],
        promotionCode: 123,
      } as unknown as CreateOrderInput),
    BadRequestException,
  );
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

test("InventoryService chỉ giữ tồn nguyên liệu theo công thức", async () => {
  await createOrder(10);
  assert.equal(await readStock(db), 0);
  await assert.rejects(() => createOrder(1), ConflictException);
  assert.equal(await readStock(db), 0);
});