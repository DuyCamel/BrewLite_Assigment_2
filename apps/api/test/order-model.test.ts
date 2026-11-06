// Test SQL của OrderModel và InventoryModel.findStock trên PostgreSQL thật (PGlite).
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { OrderModel } from "../src/models/order.model.js";
import { InventoryModel } from "../src/models/inventory.model.js";
import type { NewOrder, NewOrderItem } from "../src/types/order.types.js";
import type { PoolClient } from "../src/types/contracts.js";
import {
  PRODUCT_ID,
  UNIT_S,
  USER_ID,
  asClient,
  createTestDb,
  makeTx,
  type Tx,
} from "./tv4-helpers.js";

let db: PGlite;
let tx: Tx;
const model = new OrderModel();

before(async () => {
  db = await createTestDb();
  tx = makeTx(db);
});
after(async () => {
  await db.close();
});

function newOrder(id: string, total = UNIT_S): NewOrder {
  return {
    id,
    userId: USER_ID,
    subtotal: total,
    discount: 0,
    total,
    promotionId: null,
  };
}

function newItem(
  id: string,
  unitPrice = UNIT_S,
  quantity = 1,
  toppingIds: string[] = [],
): NewOrderItem {
  return {
    id,
    productId: PRODUCT_ID,
    productName: "Trà TV4",
    size: "S",
    toppingIds,
    quantity,
    unitPrice,
    lineTotal: unitPrice * quantity,
  };
}

// Tạo một đơn PENDING hợp lệ (đơn + chi tiết cùng transaction).
async function createPending(id: string) {
  await tx(async (c) => {
    await model.insertOrder(newOrder(id), c);
    await model.insertOrderItems(id, [newItem(`${id}-i`)], c);
  });
}

async function insertProcessingPayment(
  c: PoolClient,
  orderId: string,
  key: string,
) {
  await c.query(
    `INSERT INTO payments (id, order_id, idempotency_key, payload_hash, amount, method)
     VALUES ($1, $2, $3, repeat('c', 64), $4, 'CARD')`,
    [`pay-${key}`, orderId, key, UNIT_S],
  );
}

// Đơn đã quá hạn: phải chèn created_at trong quá khứ vì có CHECK expires_at > created_at.
async function insertExpiredOrder(c: PoolClient, id: string) {
  await c.query(
    `INSERT INTO orders (id, user_id, subtotal, total, created_at, expires_at)
     VALUES ($1, $2, $3, $3, now() - interval '1 hour', now() - interval '30 minutes')`,
    [id, USER_ID, UNIT_S],
  );
  await model.insertOrderItems(id, [newItem(`${id}-i`)], c);
}

test("insertOrder + insertOrderItems commit được qua trigger 002", async () => {
  const row = await tx(async (c) => {
    const inserted = await model.insertOrder(newOrder("m-1"), c);
    await model.insertOrderItems("m-1", [newItem("m-1-i1")], c);
    return inserted;
  });
  assert.equal(row.id, "m-1");
  assert.equal(row.status, "PENDING");
  assert.equal(row.subtotal, UNIT_S);
  assert.equal(row.discount, 0);
  assert.equal(row.total, UNIT_S);
  const remaining = new Date(row.expiresAt).getTime() - Date.now();
  assert.ok(remaining > 4 * 60_000 && remaining <= 5 * 60_000);

  const items = await db.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM order_items WHERE order_id = $1",
    ["m-1"],
  );
  assert.equal(items.rows[0].n, 1);
});

test("topping_ids được lưu thành mảng JSONB", async () => {
  await tx(async (c) => {
    await model.insertOrder(newOrder("m-2", 27000), c);
    await model.insertOrderItems(
      "m-2",
      [newItem("m-2-i", 27000, 1, ["tc"])],
      c,
    );
  });
  const result = await db.query<{ topping_ids: string[] }>(
    "SELECT topping_ids FROM order_items WHERE order_id = $1",
    ["m-2"],
  );
  assert.deepEqual(result.rows[0].topping_ids, ["tc"]);
});

test("đơn không có chi tiết bị từ chối tại COMMIT", async () => {
  await db.exec("BEGIN");
  try {
    await model.insertOrder(newOrder("m-3"), asClient(db));
    await assert.rejects(() => db.exec("COMMIT"), /subtotal/);
  } finally {
    await db.exec("ROLLBACK");
  }
});

test("giảm giá mà không có mã khuyến mãi bị từ chối", async () => {
  await db.exec("BEGIN");
  try {
    await assert.rejects(
      () =>
        model.insertOrder(
          { ...newOrder("m-4"), discount: 1000, total: UNIT_S - 1000 },
          asClient(db),
        ),
      /check constraint/,
    );
  } finally {
    await db.exec("ROLLBACK");
  }
});

test("findForUpdate trả đúng đơn, và null khi không có", async () => {
  await createPending("m-5");
  const record = await tx((c) => model.findForUpdate("m-5", c));
  assert.ok(record);
  assert.equal(record.id, "m-5");
  assert.equal(record.userId, USER_ID);
  assert.equal(record.status, "PENDING");
  assert.equal(record.total, UNIT_S);
  assert.equal(record.stockReleased, false);

  const missing = await tx((c) => model.findForUpdate("khong-co", c));
  assert.equal(missing, null);
});

test("updateStatus chỉ đổi khi đúng trạng thái cũ", async () => {
  await createPending("m-6");
  await db.exec("BEGIN");
  try {
    const c = asClient(db);
    assert.equal(
      await model.updateStatus("m-6", "PENDING", "CANCELLED", c),
      true,
    );
    assert.equal(
      await model.updateStatus("m-6", "PENDING", "CANCELLED", c),
      false,
    );
    assert.equal(
      await model.updateStatus("m-6", "PAID", "CANCELLED", c),
      false,
    );
  } finally {
    await db.exec("ROLLBACK");
  }
  const after = await db.query<{ status: string }>(
    "SELECT status FROM orders WHERE id = $1",
    ["m-6"],
  );
  assert.equal(after.rows[0].status, "PENDING"); // ROLLBACK giữ nguyên trạng thái
});

test("findExpiredPendingOrders và hasProcessingPayment", async () => {
  await tx(async (c) => {
    await insertExpiredOrder(c, "m-exp-free");
    await insertExpiredOrder(c, "m-exp-paying");
    await insertProcessingPayment(c, "m-exp-paying", "key-exp-paying");
  });
  await createPending("m-fresh"); // chưa hết hạn

  const ids = await tx((c) => model.findExpiredPendingOrders(c));
  assert.ok(
    ids.includes("m-exp-free"),
    "đơn quá hạn, không thanh toán phải có",
  );
  assert.ok(
    !ids.includes("m-exp-paying"),
    "đơn đang thanh toán PROCESSING phải bị loại",
  );
  assert.ok(!ids.includes("m-fresh"), "đơn chưa hết hạn phải bị loại");

  assert.equal(
    await tx((c) => model.hasProcessingPayment("m-exp-paying", c)),
    true,
  );
  assert.equal(
    await tx((c) => model.hasProcessingPayment("m-exp-free", c)),
    false,
  );
});

test("findForPricing trả giá, size, topping và bỏ qua id không tồn tại", async () => {
  const rows = await tx((c) =>
    model.findForPricing([PRODUCT_ID, "khong-co"], c),
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, PRODUCT_ID);
  assert.equal(rows[0].name, "Trà TV4");
  assert.equal(rows[0].price, UNIT_S);
  assert.deepEqual(rows[0].sizes, [
    { name: "S", extraPrice: 0 },
    { name: "M", extraPrice: 5000 },
  ]);
  assert.deepEqual(rows[0].toppings, [
    { id: "tc", name: "Trân châu", price: 7000 },
  ]);
});

test("findItemsForStock trả các dòng của đơn dạng productId/quantity", async () => {
  await tx(async (c) => {
    await model.insertOrder(newOrder("m-7", UNIT_S * 3), c);
    await model.insertOrderItems(
      "m-7",
      [newItem("m-7-a", UNIT_S, 1), newItem("m-7-b", UNIT_S, 2)],
      c,
    );
  });
  const items = await tx((c) => model.findItemsForStock("m-7", c));
  assert.equal(items.length, 2);
  assert.ok(items.every((i) => i.productId === PRODUCT_ID));
  assert.equal(
    items.reduce((sum, i) => sum + i.quantity, 0),
    3,
  );
});

test("reopenForRetry đưa PAYMENT_FAILED về PENDING qua trigger 002", async () => {
  await tx(async (c) => {
    await model.insertOrder(newOrder("m-8"), c);
    await model.insertOrderItems("m-8", [newItem("m-8-i")], c);
    await insertProcessingPayment(c, "m-8", "key-m-8");
    await c.query(
      "UPDATE payments SET status = 'FAILED', resolved_at = now() WHERE order_id = $1",
      ["m-8"],
    );
    await c.query(
      "UPDATE orders SET status = 'PAYMENT_FAILED', stock_released = true WHERE id = $1",
      ["m-8"],
    );
  });

  assert.equal(await tx((c) => model.reopenForRetry("m-8", c)), true);
  const row = await db.query<{
    status: string;
    stock_released: boolean;
    future: boolean;
    seconds_left: number;
  }>(
    "SELECT status, stock_released, expires_at > now() AS future, extract(epoch from expires_at - now()) AS seconds_left FROM orders WHERE id = $1",
    ["m-8"],
  );
  assert.equal(row.rows[0].status, "PENDING");
  assert.equal(row.rows[0].stock_released, false);
  assert.equal(row.rows[0].future, true);
  assert.ok(Number(row.rows[0].seconds_left) > 240 && Number(row.rows[0].seconds_left) <= 300);

  // đã là PENDING nên lần hai không đổi được
  assert.equal(await tx((c) => model.reopenForRetry("m-8", c)), false);
  // đơn PENDING bình thường cũng không được mở lại
  assert.equal(await tx((c) => model.reopenForRetry("m-5", c)), false);
});

test("InventoryModel.findStock trả stock/version, null khi không có", async () => {
  const inventory = new InventoryModel();
  const snapshot = await tx((c) => inventory.findStock(PRODUCT_ID, c));
  assert.ok(snapshot);
  assert.equal(snapshot.stock, 10);
  assert.equal(snapshot.version, 0);
  assert.equal(await tx((c) => inventory.findStock("khong-co", c)), null);
});
