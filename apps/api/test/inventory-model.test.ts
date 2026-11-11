import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { ConflictException } from "@nestjs/common";
import { InventoryModel } from "../src/models/inventory.model.js";
import type { PoolClient } from "../src/types/contracts.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const db = new PGlite();
const sql = (name: string) =>
  readFileSync(resolve(__dirname, "../database", name), "utf8");

function asClient(database: PGlite): PoolClient {
  return {
    async query(text: string, params: unknown[] = []) {
      const result = await database.query(text, params);
      return {
        rows: result.rows,
        rowCount: result.affectedRows || result.rows.length,
      };
    },
  } as unknown as PoolClient;
}

before(async () => {
  await db.exec(sql("001_schema.sql"));
  await db.exec(sql("002_seed.sql"));
});
after(async () => {
  await db.close();
});

test("reserveIngredients retries a stale ingredient version without losing available stock", async () => {
  const model = new InventoryModel();
  const productId = "inventory-cas-product";
  const ingredientId = "inventory-cas-ingredient";
  await db.query(
    "INSERT INTO products (id, name, category, price, sizes) VALUES ($1, 'CAS test', 'test', 1, '[{\"name\":\"S\",\"extraPrice\":0}]')",
    [productId],
  );
  await db.query(
    "INSERT INTO ingredients (id, name, unit, stock) VALUES ($1, 'CAS test', 'piece', 5)",
    [ingredientId],
  );
  await db.query(
    "INSERT INTO product_recipes (product_id, size, ingredient_id, quantity) VALUES ($1, 'S', $2, 1)",
    [productId, ingredientId],
  );

  let concurrentUpdate = false;
  const client: PoolClient = {
    async query(text: string, params: unknown[] = []) {
      if (text.includes("SET stock = stock - $2") && !concurrentUpdate) {
        concurrentUpdate = true;
        await db.query(
          "UPDATE ingredients SET stock = stock - 1, version = version + 1 WHERE id = $1",
          [ingredientId],
        );
      }
      const result = await db.query(text, params);
      return {
        rows: result.rows,
        rowCount: result.affectedRows || result.rows.length,
      };
    },
  } as unknown as PoolClient;

  await model.reserveIngredients(
    [{ productId, size: "S", toppingIds: [], quantity: 1 }],
    "demo-order-008",
    client,
  );

  const state = await db.query<{ stock: number; version: number }>(
    "SELECT stock, version FROM ingredients WHERE id = $1",
    [ingredientId],
  );
  assert.equal(concurrentUpdate, true);
  assert.equal(state.rows[0].stock, 3, "hai lượt đặt đều phải trừ một đơn vị");
  assert.equal(state.rows[0].version, 2);
  await db.query(
    "DELETE FROM order_ingredient_reservations WHERE order_id = $1 AND ingredient_id = $2",
    ["demo-order-008", ingredientId],
  );
});

test("reserveIngredients rejects after a stale version reveals insufficient stock", async () => {
  const model = new InventoryModel();
  const productId = "inventory-cas-empty-product";
  const ingredientId = "inventory-cas-empty-ingredient";
  await db.query(
    "INSERT INTO products (id, name, category, price, sizes) VALUES ($1, 'CAS empty test', 'test', 1, '[{\"name\":\"S\",\"extraPrice\":0}]')",
    [productId],
  );
  await db.query(
    "INSERT INTO ingredients (id, name, unit, stock) VALUES ($1, 'CAS empty test', 'piece', 1)",
    [ingredientId],
  );
  await db.query(
    "INSERT INTO product_recipes (product_id, size, ingredient_id, quantity) VALUES ($1, 'S', $2, 1)",
    [productId, ingredientId],
  );

  let concurrentUpdate = false;
  const client: PoolClient = {
    async query(text: string, params: unknown[] = []) {
      if (text.includes("SET stock = stock - $2") && !concurrentUpdate) {
        concurrentUpdate = true;
        await db.query(
          "UPDATE ingredients SET stock = 0, version = version + 1 WHERE id = $1",
          [ingredientId],
        );
      }
      const result = await db.query(text, params);
      return {
        rows: result.rows,
        rowCount: result.affectedRows || result.rows.length,
      };
    },
  } as unknown as PoolClient;

  await assert.rejects(
    () =>
      model.reserveIngredients(
        [{ productId, size: "S", toppingIds: [], quantity: 1 }],
        "demo-order-008",
        client,
      ),
    ConflictException,
  );
  assert.equal(
    (
      await db.query(
        "SELECT order_id FROM order_ingredient_reservations WHERE order_id = $1 AND ingredient_id = $2",
        ["demo-order-008", ingredientId],
      )
    ).rows.length,
    0,
  );
});

test("giữ và hoàn tồn nguyên liệu cập nhật version đúng một lần", async () => {
  const model = new InventoryModel();
  const client = asClient(db);
  const ingredientId = "inventory-test-ingredient";
  await db.query(
    "INSERT INTO ingredients (id, name, unit, stock) VALUES ($1, 'Test', 'piece', 3)",
    [ingredientId],
  );
  await db.query(
    `INSERT INTO order_ingredient_reservations (order_id, ingredient_id, quantity)
     VALUES ('demo-order-008', $1, 2)`,
    [ingredientId],
  );
  const snapshot = await db.query<{ stock: number; version: number }>(
    "SELECT stock, version FROM ingredients WHERE id = $1",
    [ingredientId],
  );
  const stockBefore = snapshot.rows[0].stock;
  const first = await model.restoreStockOnce("demo-order-008", client);
  const second = await model.restoreStockOnce("demo-order-008", client);
  const stockAfter = await db.query<{ stock: number; version: number }>(
    "SELECT stock, version FROM ingredients WHERE id = $1",
    [ingredientId],
  );

  assert.equal(first, true);
  assert.equal(second, false);
  assert.equal(stockAfter.rows[0].stock, stockBefore + 2);
  assert.equal(stockAfter.rows[0].version, snapshot.rows[0].version + 1);
});