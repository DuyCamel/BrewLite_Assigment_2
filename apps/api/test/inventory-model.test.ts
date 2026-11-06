import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { fileURLToPath } from "node:url";
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
  await db.exec(sql("002_integrity.sql"));
  await db.exec(sql("003_seed.sql"));
});
after(async () => {
  await db.close();
});

test("restoreStockOnce hoàn tồn đúng một lần", async () => {
  const model = new InventoryModel();
  const client = asClient(db);

  // đơn mẫu demo-order-008 (PENDING): lấy một sản phẩm và tổng số lượng của nó
  const item = (
    await db.query<{ product_id: string; qty: number }>(
      `SELECT product_id, SUM(quantity)::int AS qty
       FROM order_items WHERE order_id = 'demo-order-008'
       GROUP BY product_id LIMIT 1`,
    )
  ).rows[0];
  const readStock = async () =>
    (
      await db.query<{ stock: number }>(
        "SELECT stock FROM products WHERE id = $1",
        [item.product_id],
      )
    ).rows[0].stock;

  const stockBefore = await readStock();
  const first = await model.restoreStockOnce("demo-order-008", client);
  const second = await model.restoreStockOnce("demo-order-008", client);
  const stockAfter = await readStock();

  assert.equal(first, true);
  assert.equal(second, false);
  assert.equal(stockAfter, stockBefore + item.qty);
});

test("decreaseStock: trừ được, version cũ bị từ chối, hết hàng bị từ chối", async () => {
  const model = new InventoryModel();
  const client = asClient(db);
  const productId = "ca-phe-sua";

  const read = async () =>
    (
      await db.query<{ stock: number; version: number }>(
        "SELECT stock, version FROM products WHERE id = $1",
        [productId],
      )
    ).rows[0];

  const start = await read();

  // Ca 1: version đúng, đủ hàng -> trừ được
  const ok = await model.decreaseStock(productId, 1, start.version, client);
  const afterOk = await read();
  assert.equal(ok, true);
  assert.equal(afterOk.stock, start.stock - 1);
  assert.equal(afterOk.version, start.version + 1);

  // Ca 2: dùng lại version CŨ (như người đến sau) -> bị từ chối
  const stale = await model.decreaseStock(productId, 1, start.version, client);
  assert.equal(stale, false);
  assert.equal((await read()).stock, afterOk.stock); // kho không đổi

  // Ca 3: version đúng nhưng đòi nhiều hơn tồn -> bị từ chối
  const tooMany = await model.decreaseStock(
    productId,
    afterOk.stock + 1,
    afterOk.version,
    client,
  );
  assert.equal(tooMany, false);
});
