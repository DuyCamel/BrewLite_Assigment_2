// TV4 — Tranh chấp tồn kho thật: nhiều khách cùng đặt khi chỉ còn ít nguyên liệu.
// PGlite chỉ có một kết nối nên không kiểm tra được tranh chấp; test này chạy trên PostgreSQL thật.
// Chỉ chạy khi đặt RUN_PG_TESTS=1 và DB đã chạy `npm run db:migrate && npm run db:seed && npm run db:migrate`
// (kết nối qua DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME như ứng dụng). Không có thì tự bỏ qua, CI không đỏ.
// Test tự tạo dữ liệu riêng (tiền tố conc-) và dọn lại sau khi chạy.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { ConflictException } from "@nestjs/common";
import { DatabaseService } from "../src/config/db.js";
import { InventoryModel } from "../src/models/inventory.model.js";
import { OrderModel } from "../src/models/order.model.js";
import { PromotionModel } from "../src/models/promotion.model.js";
import { InventoryService } from "../src/services/inventory.service.js";
import { OrdersService } from "../src/services/orders.service.js";
import { PromotionsService } from "../src/services/promotions.service.js";

const enabled = process.env.RUN_PG_TESTS === "1";
const PRODUCT = "conc-tea";
const INGREDIENT = "conc-ing";
const USERS = Array.from({ length: 10 }, (_, i) => `conc-user-${i + 1}`);

let db: DatabaseService;
let orders: OrdersService;

async function resetData(stock: number) {
  await cleanup();
  for (const id of USERS) {
    await db.query(
      `INSERT INTO users (id, email, password_hash, display_name)
       VALUES ($1, $2, $3, 'Conc')`,
      [id, `${id}@example.com`, "$2b$10$" + "a".repeat(53)],
    );
  }
  await db.query(
    `INSERT INTO products (id, name, category, price, sizes)
     VALUES ($1, 'Trà tranh chấp', 'Test', 20000, '[{"name":"S","extraPrice":0}]')`,
    [PRODUCT],
  );
  await db.query(
    "INSERT INTO ingredients (id, name, unit, stock) VALUES ($1, 'Nguyên liệu tranh chấp', 'piece', $2)",
    [INGREDIENT, stock],
  );
  await db.query(
    "INSERT INTO product_recipes (product_id, size, ingredient_id, quantity) VALUES ($1, 'S', $2, 1)",
    [PRODUCT, INGREDIENT],
  );
}

async function cleanup() {
  const ids = [...USERS];
  // Xóa theo thứ tự phụ thuộc; đơn PENDING/CANCELLED được phép xóa, PAID thì test này không tạo.
  await db.query(
    "DELETE FROM order_ingredient_reservations WHERE order_id IN (SELECT id FROM orders WHERE user_id = ANY($1))",
    [ids],
  );
  await db.query("DELETE FROM orders WHERE user_id = ANY($1)", [ids]);
  await db.query("DELETE FROM product_recipes WHERE product_id = $1", [PRODUCT]);
  await db.query("DELETE FROM ingredients WHERE id = $1", [INGREDIENT]);
  await db.query("DELETE FROM products WHERE id = $1", [PRODUCT]);
  await db.query("DELETE FROM users WHERE id = ANY($1)", [ids]);
}

const place = (userId: string, quantity = 1) =>
  orders.createOrder(userId, {
    items: [{ productId: PRODUCT, size: "S", toppingIds: [], quantity }],
  });

async function readState() {
  const stock = await db.query<{ stock: number; version: number }>(
    "SELECT stock, version FROM ingredients WHERE id = $1",
    [INGREDIENT],
  );
  const created = await db.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM orders WHERE user_id = ANY($1)",
    [USERS],
  );
  const reserved = await db.query<{ n: number }>(
    `SELECT COALESCE(sum(r.quantity), 0)::int AS n
       FROM order_ingredient_reservations r
       JOIN orders o ON o.id = r.order_id
      WHERE o.user_id = ANY($1) AND o.status = 'PENDING'`,
    [USERS],
  );
  return {
    stock: stock.rows[0].stock,
    version: stock.rows[0].version,
    orders: created.rows[0].n,
    reserved: reserved.rows[0].n,
  };
}

before(async () => {
  if (!enabled) return;
  db = new DatabaseService();
  const inventory = new InventoryService(new InventoryModel());
  const promotions = new PromotionsService(new PromotionModel(db));
  orders = new OrdersService(db, new OrderModel(), inventory, promotions);
});

after(async () => {
  if (!enabled) return;
  await cleanup();
  await db.onModuleDestroy();
});

test("hai khách cùng đặt món còn đúng 1 phần: một người thành công, người kia bị 409, tồn không âm", { skip: !enabled && "đặt RUN_PG_TESTS=1 để chạy trên PostgreSQL thật" }, async () => {
  await resetData(1);
  const results = await Promise.allSettled([place(USERS[0]), place(USERS[1])]);

  const ok = results.filter((r) => r.status === "fulfilled");
  const failed = results.filter(
    (r): r is PromiseRejectedResult => r.status === "rejected",
  );
  assert.equal(ok.length, 1, "đúng một khách giữ được phần cuối");
  assert.equal(failed.length, 1);
  assert.ok(failed[0].reason instanceof ConflictException, "người thua nhận 409");

  const state = await readState();
  assert.equal(state.stock, 0, "tồn về 0, không âm");
  assert.equal(state.version, 1, "version tăng đúng theo lần giữ nguyên liệu");
  assert.equal(state.orders, 1, "chỉ một đơn được tạo, đơn thua đã rollback");
  assert.equal(state.reserved, 1);
});

test("hai khách đặt cùng lúc 2 ly khi chỉ còn 2: một đơn thành công, đơn kia rollback toàn bộ", { skip: !enabled && "đặt RUN_PG_TESTS=1 để chạy trên PostgreSQL thật" }, async () => {
  await resetData(2);
  const settled = await Promise.allSettled([
    place(USERS[0], 2),
    place(USERS[1], 2),
  ]);
  assert.equal(settled.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(settled.filter((result) => result.status === "rejected").length, 1);

  const state = await readState();
  assert.equal(state.stock, 0);
  assert.equal(state.version, 1);
  assert.equal(state.orders, 1);
  assert.equal(state.reserved, 2);
});

test("10 khách cùng đặt khi còn 3 phần: đúng 3 thành công, 7 bị 409, tồn không bao giờ âm", { skip: !enabled && "đặt RUN_PG_TESTS=1 để chạy trên PostgreSQL thật" }, async () => {
  await resetData(3);
  const results = await Promise.allSettled(USERS.map((id) => place(id)));

  const ok = results.filter((r) => r.status === "fulfilled").length;
  const conflicts = results.filter(
    (r) => r.status === "rejected" && r.reason instanceof ConflictException,
  ).length;
  assert.equal(ok, 3);
  assert.equal(conflicts, 7);

  const state = await readState();
  assert.equal(state.stock, 0);
  assert.equal(state.version, 3);
  assert.equal(state.orders, 3);
  assert.equal(state.reserved, 3);
});