// PostgreSQL thật biên dịch WebAssembly để test schema/PLpgSQL độc lập, không cần Docker.
// Không thay PostgreSQL production; kiểm thử tranh chấp nhiều kết nối cần DB server thật.
import { PGlite } from "@electric-sql/pglite";
import { compareSync } from "bcryptjs";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const db = new PGlite();
const sql = (name: string) =>
  readFileSync(resolve(__dirname, "../database", name), "utf8");
before(async () => {
  await db.exec("BEGIN");
  await db.exec(sql("001_schema.sql"));
  await db.exec(sql("002_seed.sql"));
  await db.exec("COMMIT");
});
after(async () => {
  await db.close();
});
async function rejectSql(statement: string, expectedCode: "23505" | "23514") {
  await db.exec("BEGIN");
  try {
    await assert.rejects(async () => {
      await db.exec(statement);
      await db.exec("COMMIT");
    }, (error: unknown) =>
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === expectedCode,
    );
  } finally {
    await db.exec("ROLLBACK");
  }
}
test("seed có đủ dữ liệu, trạng thái và mật khẩu hash dùng được", async () => {
  const expected: Record<string, number> = {
    products: 40,
    users: 24,
    promotions: 8,
    orders: 84,
    order_items: 168,
    payments: 82,
    loyalty_transactions: 48,
  };
  for (const [table, count] of Object.entries(expected)) {
    const result = await db.query<{ n: number }>(
      `SELECT count(*)::int n FROM ${table}`,
    );
    assert.equal(result.rows[0].n, count, table);
  }
  const states = await db.query(
    "SELECT status,count(*)::int n FROM orders GROUP BY status",
  );
  assert.equal(states.rows.length, 7);
  assert.ok(states.rows.every((r: any) => r.n === 12));
  const user = await db.query<{ password_hash: string }>(
    "SELECT password_hash FROM users LIMIT 1",
  );
  assert.ok(compareSync("BrewLite123!", user.rows[0].password_hash));
});
test("migration bỏ tồn kho sản phẩm nhưng giữ version", async () => {
  await db.query(
    "INSERT INTO ingredients (id, name, unit, stock) VALUES ('inventory-migration-check', 'Migration check', 'piece', 17)",
  );
  await db.query("UPDATE products SET version = 42 WHERE id = 'ca-phe-sua'");
  await db.exec(sql("010_product_inventory.sql"));
  await db.exec(sql("010_product_inventory.sql"));
  const columns = await db.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'products' AND column_name IN ('stock', 'version')`,
  );
  assert.deepEqual(columns.rows.map((row) => row.column_name), ["version"]);
  const preserved = await db.query<{ stock: number; version: number }>(
    `SELECT i.stock, p.version
     FROM ingredients i CROSS JOIN products p
     WHERE i.id = 'inventory-migration-check' AND p.id = 'ca-phe-sua'`,
  );
  assert.deepEqual(preserved.rows, [{ stock: 17, version: 42 }]);
});
test("seed có thể chạy lại mà không tăng dữ liệu/điểm", async () => {
  const before = await db.query(
    "SELECT sum(loyalty_points)::int points FROM users",
  );
  await db.exec(sql("002_seed.sql"));
  const after = await db.query(
    "SELECT sum(loyalty_points)::int points FROM users",
  );
  assert.deepEqual(after.rows, before.rows);
  assert.equal(
    (await db.query<{ n: number }>("SELECT count(*)::int n FROM orders"))
      .rows[0].n,
    84,
  );
});
test("Sản phẩm không lưu tồn kho nhưng giữ version; option null/size trùng bị chặn", async () => {
  const productInventoryColumns = await db.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'products' AND column_name IN ('stock', 'version')`,
  );
  assert.deepEqual(
    productInventoryColumns.rows.map((row) => row.column_name),
    ["version"],
  );
  await rejectSql(
    `UPDATE products SET sizes='[{"name":"S","extraPrice":null}]' WHERE id='ca-phe-sua'`,
    "23514",
  );
  await rejectSql(
    `UPDATE products SET sizes='[{"name":"S","extraPrice":0},{"name":"S","extraPrice":1}]' WHERE id='ca-phe-sua'`,
    "23514",
  );
});
test("Chặn email trùng khác hoa thường và ưu đãi sai", async () => {
  await rejectSql(
    "INSERT INTO users SELECT 'bad-user',upper(email),password_hash,display_name,0,now() FROM users LIMIT 1",
    "23505",
  );
  await rejectSql(
    "UPDATE promotions SET value=101 WHERE code='WELCOME10'",
    "23514",
  );
  await rejectSql(
    "UPDATE promotions SET ends_at=starts_at WHERE code='WELCOME10'",
    "23514",
  );
});
test("Chặn sai số lượng và tổng dòng; sai subtotal tại COMMIT", async () => {
  await rejectSql(
    "INSERT INTO orders(id,user_id,subtotal,total) VALUES ('bad-order','demo-user-01',35000,35000); INSERT INTO order_items VALUES ('bad-item','bad-order','ca-phe-sua','Cà phê sữa','S','[]',0,35000,0)",
    "23514",
  );
  await rejectSql(
    "INSERT INTO orders(id,user_id,subtotal,total) VALUES ('bad-order','demo-user-01',35000,35000); INSERT INTO order_items VALUES ('bad-item','bad-order','ca-phe-sua','Cà phê sữa','S','[]',1,35000,35001)",
    "23514",
  );
  await rejectSql(
    "INSERT INTO orders(id,user_id,subtotal,total) VALUES ('bad-order','demo-user-01',35000,35000)",
    "23514",
  );
});
test("Chặn nhảy trạng thái, sửa giá chốt và xóa đơn đã trả tiền", async () => {
  await rejectSql(
    "UPDATE orders SET status='READY' WHERE id='demo-order-001'",
    "23514",
  );
  await rejectSql(
    "UPDATE orders SET subtotal=subtotal+1,total=total+1 WHERE id='demo-order-001'",
    "23514",
  );
  await rejectSql(
    "DELETE FROM orders WHERE id='demo-order-003'",
    "23514",
  );
});
test("Chặn PAID không có payment/EARN và hủy khi PROCESSING", async () => {
  await rejectSql(
    "UPDATE orders SET status='PAID' WHERE id='demo-order-001'",
    "23514",
  );
  await rejectSql(
    "UPDATE orders SET status='CANCELLED' WHERE id='demo-order-001'",
    "23514",
  );
});
test("Chặn thanh toán sai tiền, key trùng, hai attempt live và sửa attempt cuối", async () => {
  await rejectSql(
    "INSERT INTO payments VALUES ('bad-pay','demo-order-008','new-key',repeat('a',64),1,'CARD','PROCESSING',now(),NULL)",
    "23514",
  );
  const row = (
    await db.query<any>(
      "SELECT * FROM payments WHERE order_id='demo-order-001'",
    )
  ).rows[0];
  await rejectSql(
    `INSERT INTO payments SELECT 'bad-pay',order_id,idempotency_key,payload_hash,amount,method,'PROCESSING',now(),NULL FROM payments WHERE id='${row.id}'`,
    "23505",
  );
  await rejectSql(
    `INSERT INTO payments SELECT 'bad-pay',order_id,'new-key',payload_hash,amount,method,'PROCESSING',now(),NULL FROM payments WHERE id='${row.id}'`,
    "23505",
  );
  await rejectSql(
    "UPDATE payments SET status='FAILED',resolved_at=now() WHERE id='demo-payment-003-final'",
    "23514",
  );
});
test("Chặn EARN trùng, sai chủ đơn, chưa PAID và sửa tổng điểm", async () => {
  await rejectSql(
    "INSERT INTO loyalty_transactions SELECT 'bad-earn',user_id,order_id,type,points,now() FROM loyalty_transactions LIMIT 1",
    "23505",
  );
  await rejectSql(
    "INSERT INTO loyalty_transactions VALUES ('bad-earn','demo-user-01','demo-order-003','EARN',1,now())",
    "23514",
  );
  await rejectSql(
    "INSERT INTO loyalty_transactions VALUES ('bad-earn','demo-user-01','demo-order-001','EARN',1,now())",
    "23514",
  );
  await rejectSql(
    "UPDATE users SET loyalty_points=loyalty_points+1 WHERE id='demo-user-01'",
    "23514",
  );
});

test("Chặn topping sai và PAID thiếu EARN dù payment đã thành công", async () => {
  await rejectSql(
    `INSERT INTO orders(id,user_id,subtotal,total) VALUES ('bad-order','demo-user-01',35000,35000); INSERT INTO order_items VALUES ('bad-item','bad-order','ca-phe-sua','Cà phê sữa','S','["not-allowed"]',1,35000,35000)`,
    "23514",
  );
  await rejectSql(
    `UPDATE payments SET status='SUCCEEDED',resolved_at=now() WHERE order_id='demo-order-001'; UPDATE orders SET status='PAID' WHERE id='demo-order-001'`,
    "23514",
  );
});
test("Transaction thanh toán hợp lệ chốt PAID và trigger cộng điểm đúng một lần", async () => {
  const order = (
    await db.query<any>("SELECT * FROM orders WHERE id='demo-order-008'")
  ).rows[0];
  const points = Math.floor(order.total / 10000);
  const balance = (
    await db.query<any>("SELECT loyalty_points FROM users WHERE id=$1", [
      order.user_id,
    ])
  ).rows[0].loyalty_points;
  await db.exec("BEGIN");
  await db.query(
    "INSERT INTO payments(id,order_id,idempotency_key,payload_hash,amount,method) VALUES('valid-pay',$1,'valid-key',repeat('b',64),$2,'CARD')",
    [order.id, order.total],
  );
  await db.exec(
    "UPDATE payments SET status='SUCCEEDED',resolved_at=now() WHERE id='valid-pay'; UPDATE orders SET status='PAID' WHERE id='demo-order-008';",
  );
  await db.query(
    "INSERT INTO loyalty_transactions(id,user_id,order_id,points) VALUES('valid-earn',$1,$2,$3)",
    [order.user_id, order.id, points],
  );
  await db.exec("COMMIT");
  assert.equal(
    (
      await db.query<any>("SELECT loyalty_points FROM users WHERE id=$1", [
        order.user_id,
      ])
    ).rows[0].loyalty_points,
    balance + points,
  );
  assert.equal(
    (await db.query<any>("SELECT status FROM orders WHERE id=$1", [order.id]))
      .rows[0].status,
    "PAID",
  );
});

test("Chi tiết bị khóa sau transaction tạo đơn, kể cả sửa cùng tổng tiền", async () => {
  await rejectSql(
    "UPDATE order_items SET product_name='Đổi món đồng giá' WHERE order_id='demo-order-001'",
    "23514",
  );
  await rejectSql(
    "UPDATE order_items SET product_name='Đổi món chưa thanh toán' WHERE order_id='demo-order-008'",
    "23514",
  );
  await rejectSql(
    "INSERT INTO order_items VALUES ('bad-item','demo-order-008','ca-phe-sua','Cà phê sữa','S','[]',1,0,0)",
    "23514",
  );
});
