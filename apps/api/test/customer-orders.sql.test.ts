// TV6 — Chạy SQL thật của CustomerOrderModel trên schema 001/002/003 bằng PGlite (như database.test.ts).
// Không thay test PostgreSQL server; kiểm tra tranh chấp nhiều kết nối vẫn cần DB thật.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { CustomerOrderModel } from "../src/models/customer-order.model.js";
import type { DatabaseService } from "../src/config/db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pg = new PGlite();
const sql = (name: string) =>
  readFileSync(resolve(__dirname, "../database", name), "utf8");

// Bọc PGlite cho giống pg: rowCount thay cho affectedRows.
const adapter = {
  query: async (text: string, params: unknown[] = []) => {
    const r = await pg.query<any>(text, params);
    return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
  },
};
const model = new CustomerOrderModel(adapter as unknown as DatabaseService);

before(async () => {
  await pg.exec("BEGIN");
  await pg.exec(sql("001_schema.sql"));
  await pg.exec(sql("007_order_payment_codes.sql"));
  await pg.exec(sql("002_integrity.sql"));
  await pg.exec(sql("003_seed.sql"));
  await pg.exec("COMMIT");
});
after(async () => {
  await pg.close();
});

test("lịch sử: đủ số đơn của user, mới nhất trước, không lẫn đơn người khác", async () => {
  const top = (
    await pg.query<any>(
      "SELECT user_id, count(*)::int n FROM orders GROUP BY user_id ORDER BY n DESC, user_id LIMIT 1",
    )
  ).rows[0];
  const rows = await model.findSummariesByUser(top.user_id, 1000, 0);
  assert.equal(rows.length, top.n);
  for (let i = 1; i < rows.length; i++) {
    assert.ok(
      new Date(rows[i - 1].created_at).getTime() >=
        new Date(rows[i].created_at).getTime(),
    );
  }
  assert.ok(rows.every((r) => r.item_count > 0));
  const ids = rows.map((r) => `'${r.id}'`).join(",");
  const foreign = await pg.query<any>(
    `SELECT count(*)::int n FROM orders WHERE id IN (${ids}) AND user_id <> $1`,
    [top.user_id],
  );
  assert.equal(foreign.rows[0].n, 0);
  const page = await model.findSummariesByUser(top.user_id, 2, 1);
  assert.deepEqual(
    page.map((r) => r.id),
    rows.slice(1, 3).map((r) => r.id),
  );
});

test("chi tiết đơn PAID của chủ đơn: có món khớp subtotal, payment thành công, điểm EARN, không lộ key nội bộ", async () => {
  const order = (
    await pg.query<any>(
      "SELECT id, user_id FROM orders WHERE status = 'PAID' LIMIT 1",
    )
  ).rows[0];
  const detail = await model.findDetailForUser(order.id, order.user_id);
  assert.ok(detail);
  assert.ok(detail.items.length > 0);
  assert.equal(
    detail.items.reduce((sum, i) => sum + i.lineTotal, 0),
    detail.subtotal,
  );
  assert.ok(Array.isArray(detail.items[0].toppingIds));
  assert.ok(detail.payments.some((p) => p.status === "SUCCEEDED"));
  assert.notEqual(detail.points_earned, null);
  const text = JSON.stringify(detail);
  assert.ok(!/idempotency|payload_hash/i.test(text));
});

test("chi tiết đơn của người khác hoặc không tồn tại → undefined", async () => {
  const order = (await pg.query<any>("SELECT id, user_id FROM orders LIMIT 1"))
    .rows[0];
  const other = (
    await pg.query<any>("SELECT id FROM users WHERE id <> $1 LIMIT 1", [
      order.user_id,
    ])
  ).rows[0];
  assert.equal(await model.findDetailForUser(order.id, other.id), undefined);
  assert.equal(
    await model.findDetailForUser("khong-co", order.user_id),
    undefined,
  );
});

test("lockStatus + updateStatus: compare-and-set theo trạng thái cũ", async () => {
  const order = (
    await pg.query<any>(
      "SELECT id FROM orders WHERE status = 'PENDING' LIMIT 1",
    )
  ).rows[0];
  await pg.exec("BEGIN");
  try {
    assert.equal(await model.lockStatus(adapter as never, order.id), "PENDING");
    assert.equal(
      await model.updateStatus(
        adapter as never,
        order.id,
        "PENDING",
        "CANCELLED",
      ),
      true,
    );
    // from không còn đúng → không đổi dòng nào
    assert.equal(
      await model.updateStatus(
        adapter as never,
        order.id,
        "PENDING",
        "CANCELLED",
      ),
      false,
    );
    assert.equal(
      await model.lockStatus(adapter as never, "khong-co"),
      undefined,
    );
  } finally {
    await pg.exec("ROLLBACK"); // không commit: tránh vi phạm ràng buộc stock_released
  }
});
