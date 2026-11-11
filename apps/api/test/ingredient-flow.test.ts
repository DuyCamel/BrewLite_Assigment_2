// TV4 — Test luồng nguyên liệu (schema 001, công thức 006): đặt đơn trừ nguyên liệu theo công thức, hủy hoàn,
// thanh toán thất bại rồi thử lại, hết nguyên liệu, món không có công thức.
// DB là PGlite đủ 001 đến 006 (xem createIngredientTestDb). Service dựng bằng tay như order-service.test.ts.
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { ConflictException } from "@nestjs/common";
import { InventoryModel } from "../src/models/inventory.model";
import { OrderModel } from "../src/models/order.model";
import { ProductModel } from "../src/models/product.model";
import { PromotionModel } from "../src/models/promotion.model";
import { InventoryService } from "../src/services/inventory.service";
import { OrdersService } from "../src/services/orders.service";
import { PromotionsService } from "../src/services/promotions.service";
import {
  ING_PEARL,
  ING_START,
  ING_TEA,
  NO_RECIPE_PRODUCT_ID,
  PEARL_PER_TOPPING,
  PRODUCT_ID,
  TEA_PER_SIZE,
  USER_ID,
  countOrders,
  createIngredientTestDb,
  makeFakeDatabase,
  makeTx,
  readIngredient,
  readOrder,
  readReservations,
  setIngredient,
  type Tx,
} from "./tv4-helpers";

let db: PGlite;
let tx: Tx;
let service: OrdersService;
let inventory: InventoryService;
let products: ProductModel;

before(async () => {
  db = await createIngredientTestDb();
  tx = makeTx(db);
  const fakeDb = makeFakeDatabase(db);
  inventory = new InventoryService(new InventoryModel());
  products = new ProductModel(fakeDb);
  const promotions = new PromotionsService(new PromotionModel(fakeDb));
  service = new OrdersService(fakeDb, new OrderModel(), inventory, promotions);
});
after(async () => {
  await db.close();
});
beforeEach(async () => {
  await setIngredient(db, ING_TEA, ING_START);
  await setIngredient(db, ING_PEARL, ING_START);
});

// Một dòng đơn: size M kèm 1 topping trân châu (mặc định số lượng 2).
const lineM = (quantity = 2) => ({
  productId: PRODUCT_ID,
  size: "M",
  toppingIds: ["tc"],
  quantity,
});
const TEA_FOR_TWO = TEA_PER_SIZE.M * 2; // 250 ml
const PEARL_FOR_TWO = PEARL_PER_TOPPING * 2; // 100 g

test("check-stock derives availability from size and topping recipes", async () => {
  await products.checkStock(PRODUCT_ID, "M", ["tc"], 2);

  await setIngredient(db, ING_TEA, TEA_FOR_TWO - 1);
  await assert.rejects(
    () => products.checkStock(PRODUCT_ID, "M", ["tc"], 2),
    ConflictException,
  );
  await assert.rejects(
    () => products.checkStock(NO_RECIPE_PRODUCT_ID, "S", [], 1),
    ConflictException,
  );
});

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
    await c.query("UPDATE orders SET status = 'PAYMENT_FAILED' WHERE id = $1", [orderId]);
    await inventory.releaseStock(orderId, c);
  });
}

test("đặt đơn trừ tồn nguyên liệu theo công thức size và topping", async () => {
  const versionBefore = await db.query<{ id: string; version: number }>(
    "SELECT id, version FROM ingredients WHERE id = ANY($1)",
    [[ING_TEA, ING_PEARL]],
  );
  const created = await service.createOrder(USER_ID, { items: [lineM()] });
  assert.equal(await readIngredient(db, ING_TEA), ING_START - TEA_FOR_TWO);
  assert.equal(await readIngredient(db, ING_PEARL), ING_START - PEARL_FOR_TWO);
  // readReservations sắp theo ingredient_id: 'tv4-nl-tc' đứng trước 'tv4-nl-tra'.
  assert.deepEqual(await readReservations(db, created.orderId), [
    { ingredientId: ING_PEARL, quantity: PEARL_FOR_TWO },
    { ingredientId: ING_TEA, quantity: TEA_FOR_TWO },
  ]);
  const versionAfter = await db.query<{ id: string; version: number }>(
    "SELECT id, version FROM ingredients WHERE id = ANY($1)",
    [[ING_TEA, ING_PEARL]],
  );
  const versionsBefore = new Map(
    versionBefore.rows.map((row) => [row.id, row.version]),
  );
  assert.ok(
    versionAfter.rows.every(
      (row) => row.version === (versionsBefore.get(row.id) ?? -1) + 1,
    ),
  );
});

test("hủy đơn hoàn đúng nguyên liệu một lần, xóa bản giữ chỗ, hủy lại bị 409", async () => {
  const created = await service.createOrder(USER_ID, { items: [lineM()] });
  await service.cancelOrder(USER_ID, created.orderId);
  assert.equal(await readIngredient(db, ING_TEA), ING_START);
  assert.equal(await readIngredient(db, ING_PEARL), ING_START);
  assert.deepEqual(await readReservations(db, created.orderId), []);
  assert.equal((await readOrder(db, created.orderId)).status, "CANCELLED");

  await assert.rejects(
    () => service.cancelOrder(USER_ID, created.orderId),
    ConflictException,
  );
  assert.equal(await readIngredient(db, ING_TEA), ING_START, "hủy lại không được hoàn thêm");
});

test("hết nguyên liệu trả 409 và rollback: không có đơn mới, tồn không đổi", async () => {
  await setIngredient(db, ING_TEA, TEA_FOR_TWO - 1);
  const before = await countOrders(db);
  await assert.rejects(
    () => service.createOrder(USER_ID, { items: [lineM()] }),
    ConflictException,
  );
  assert.equal(await countOrders(db), before);
  assert.equal(await readIngredient(db, ING_TEA), TEA_FOR_TWO - 1);
  assert.equal(await readIngredient(db, ING_PEARL), ING_START);
});

test("thanh toán thất bại rồi thử lại: giữ lại nguyên liệu (cần orderId trong reserveStock)", async () => {
  const created = await service.createOrder(USER_ID, { items: [lineM()] });
  await simulatePaymentFailure(created.orderId, created.total);
  assert.equal((await readOrder(db, created.orderId)).status, "PAYMENT_FAILED");
  assert.equal(await readIngredient(db, ING_TEA), ING_START);
  assert.deepEqual(await readReservations(db, created.orderId), []);

  // hết nguyên liệu: 409, đơn vẫn PAYMENT_FAILED
  await setIngredient(db, ING_TEA, TEA_FOR_TWO - 1);
  await assert.rejects(
    () => service.preparePaymentRetry(USER_ID, created.orderId),
    ConflictException,
  );
  assert.equal((await readOrder(db, created.orderId)).status, "PAYMENT_FAILED");

  // còn nguyên liệu: về PENDING và giữ lại đúng nguyên liệu
  await setIngredient(db, ING_TEA, ING_START);
  const retried = await service.preparePaymentRetry(USER_ID, created.orderId);
  assert.deepEqual(retried, { orderId: created.orderId, status: "PENDING" });
  assert.equal(await readIngredient(db, ING_TEA), ING_START - TEA_FOR_TWO);
  assert.equal(await readIngredient(db, ING_PEARL), ING_START - PEARL_FOR_TWO);
  assert.equal((await readReservations(db, created.orderId)).length, 2);

  // hủy sau khi thử lại phải hoàn đủ
  await service.cancelOrder(USER_ID, created.orderId);
  assert.equal(await readIngredient(db, ING_TEA), ING_START);
  assert.equal(await readIngredient(db, ING_PEARL), ING_START);
});

test("món không có công thức: đặt riêng bị 409 và không tạo đơn", async () => {
  const before = await countOrders(db);
  await assert.rejects(
    () =>
      service.createOrder(USER_ID, {
        items: [{ productId: NO_RECIPE_PRODUCT_ID, size: "S", toppingIds: [], quantity: 1 }],
      }),
    ConflictException,
  );
  assert.equal(await countOrders(db), before);
});

test("đơn có món không công thức lẫn món có công thức bị từ chối 409", async () => {
  const before = await countOrders(db);
  await assert.rejects(
    () =>
      service.createOrder(USER_ID, {
        items: [
          lineM(1),
          { productId: NO_RECIPE_PRODUCT_ID, size: "S", toppingIds: [], quantity: 1 },
        ],
      }),
    ConflictException,
  );
  assert.equal(await countOrders(db), before, "đơn phải rollback");
  assert.equal(await readIngredient(db, ING_TEA), ING_START, "không được giữ một phần tồn");
  assert.equal(await readIngredient(db, ING_PEARL), ING_START, "không được giữ topping");
});

test("món trong danh mục thật (ca-phe-sua): size M đúng quy tắc nhân 1,25 làm tròn lên và trừ đúng tồn", async () => {
  const recipe = async (size: string) =>
    (
      await db.query<{ ingredientId: string; quantity: number }>(
        `SELECT ingredient_id AS "ingredientId", quantity FROM product_recipes
         WHERE product_id = 'ca-phe-sua' AND size = $1 ORDER BY ingredient_id`,
        [size],
      )
    ).rows;
  const small = await recipe("S");
  const medium = await recipe("M");
  assert.ok(small.length > 0, "ca-phe-sua phải có công thức sau migration 006");
  assert.equal(medium.length, small.length);
  small.forEach((row, index) => {
    assert.equal(medium[index].ingredientId, row.ingredientId);
    assert.equal(medium[index].quantity, Math.ceil(row.quantity * 1.25), row.ingredientId);
  });

  const stockBefore = new Map<string, number>();
  for (const row of medium) stockBefore.set(row.ingredientId, await readIngredient(db, row.ingredientId));

  await service.createOrder(USER_ID, {
    items: [{ productId: "ca-phe-sua", size: "M", toppingIds: [], quantity: 1 }],
  });
  for (const row of medium) {
    assert.equal(
      await readIngredient(db, row.ingredientId),
      stockBefore.get(row.ingredientId)! - row.quantity,
      row.ingredientId,
    );
  }
});