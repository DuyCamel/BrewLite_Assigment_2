// TV3 — API đơn của khách phải cần đăng nhập thật và chỉ trả dữ liệu của chính chủ.
// Dựng toàn bộ AppModule (cùng controller/provider với bản chạy thật), chỉ thay DatabaseService bằng PGlite đã nạp schema + seed.
// Đi qua HTTP thật: đăng ký, đăng nhập, rồi gọi /orders/me và /orders/:id với JWT (Guard + Controller + Service + SQL).
import "reflect-metadata";
import { PGlite } from "@electric-sql/pglite";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { after, before, test } from "node:test";
import { Module, type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { sign } from "jsonwebtoken";
import { AppModule } from "../src/app.module";
import { DatabaseService } from "../src/config/db";

const SECRET = "test-secret-for-brewlite-orders-auth-0123456789";
const SEED_PASSWORD = "BrewLite123!";
const pg = new PGlite();
// Bọc PGlite cho giống pg: rowCount thay cho affectedRows (cùng cách với customer-orders.sql.test.ts).
const adapter = {
  query: async (text: string, params: unknown[] = []) => {
    const r = await pg.query<Record<string, unknown>>(text, params);
    return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
  },
};
const sql = (name: string) =>
  readFileSync(resolve(__dirname, "../database", name), "utf8");

let app: INestApplication;
let origin = "";
let owner: {
  userId: string;
  email: string;
  orderCount: number;
  orderId: string;
};
const saved = {
  PRODUCT_DATA_SOURCE: process.env.PRODUCT_DATA_SOURCE,
  JWT_SECRET: process.env.JWT_SECRET,
};

before(async () => {
  process.env.PRODUCT_DATA_SOURCE = "postgres";
  process.env.JWT_SECRET = SECRET;
  await pg.exec("BEGIN");
  await pg.exec(sql("001_schema.sql"));
  await pg.exec(sql("002_integrity.sql"));
  await pg.exec(sql("003_seed.sql"));
  await pg.exec("COMMIT");
  const top = (
    await pg.query<{
      user_id: string;
      email: string;
      n: number;
      order_id: string;
    }>(
      `SELECT o.user_id, u.email, count(*)::int AS n, min(o.id) AS order_id
       FROM orders o JOIN users u ON u.id = o.user_id
       GROUP BY o.user_id, u.email ORDER BY n DESC, u.email LIMIT 1`,
    )
  ).rows[0];
  assert.ok(top, "dữ liệu seed phải có ít nhất một user có đơn");
  owner = {
    userId: top.user_id,
    email: top.email,
    orderCount: top.n,
    orderId: top.order_id,
  };

  // Lấy đúng danh sách controller/provider của AppModule, chỉ thay DatabaseService: không phải sửa test này khi nhóm thêm service mới.
  const controllers = Reflect.getMetadata(
    "controllers",
    AppModule,
  ) as unknown[];
  const providers = (
    Reflect.getMetadata("providers", AppModule) as unknown[]
  ).map((provider) =>
    provider === DatabaseService
      ? { provide: DatabaseService, useValue: adapter }
      : provider,
  );
  @Module({
    controllers: controllers as never[],
    providers: providers as never[],
  })
  class TestModule {}
  app = await NestFactory.create(TestModule, { logger: false });
  await app.listen(0, "127.0.0.1");
  origin = await app.getUrl();
});
after(async () => {
  await app?.close();
  await pg.close();
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

async function api(
  path: string,
  init: { method?: string; token?: string; body?: unknown } = {},
) {
  const response = await fetch(`${origin}${path}`, {
    method: init.method ?? "GET",
    headers: {
      ...(init.body === undefined
        ? {}
        : { "content-type": "application/json" }),
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}
async function login(email: string, password: string): Promise<string> {
  const result = await api("/auth/login", {
    method: "POST",
    body: { email, password },
  });
  assert.equal(result.status, 200, `đăng nhập ${email}`);
  return result.body.accessToken as string;
}

test("chưa đăng nhập: /orders/me và /orders/:id trả 401 TOKEN_MISSING", async () => {
  for (const path of ["/orders/me", `/orders/${owner.orderId}`]) {
    const result = await api(path);
    assert.equal(result.status, 401, path);
    assert.equal(result.body.code, "TOKEN_MISSING", path);
  }
});

test("đăng nhập user seed có đơn: /orders/me trả đúng đơn của chính họ", async () => {
  const token = await login(owner.email, SEED_PASSWORD);
  const result = await api("/orders/me?limit=50", { token });
  assert.equal(result.status, 200);
  assert.equal(result.body.orders.length, Math.min(owner.orderCount, 50));
  const mine = new Set(
    (
      await pg.query<{ id: string }>(
        "SELECT id FROM orders WHERE user_id = $1",
        [owner.userId],
      )
    ).rows.map((r) => r.id),
  );
  for (const order of result.body.orders as { id: string }[])
    assert.ok(mine.has(order.id), `đơn ${order.id} không thuộc user này`);
});

test("user mới đăng ký thấy danh sách rỗng, kể cả khi gửi userId của người khác trên query", async () => {
  const email = "nguoi.moi.tv3@example.com";
  const created = await api("/auth/register", {
    method: "POST",
    body: { email, password: "Mat-khau-moi-1" },
  });
  assert.equal(created.status, 201);
  const token = await login(email, "Mat-khau-moi-1");
  const plain = await api("/orders/me", { token });
  assert.equal(plain.status, 200);
  assert.deepEqual(plain.body.orders, []);
  const spoofed = await api(
    `/orders/me?userId=${encodeURIComponent(owner.userId)}`,
    { token },
  );
  assert.equal(spoofed.status, 200);
  assert.deepEqual(
    spoofed.body.orders,
    [],
    "userId trên query không được ảnh hưởng kết quả",
  );
});

test("chi tiết đơn: chủ đơn xem được (200), người khác nhận 404 (không lộ đơn tồn tại)", async () => {
  const ownerToken = await login(owner.email, SEED_PASSWORD);
  const own = await api(`/orders/${owner.orderId}`, { token: ownerToken });
  assert.equal(own.status, 200);
  assert.equal(own.body.id, owner.orderId);
  const otherToken = await login("nguoi.moi.tv3@example.com", "Mat-khau-moi-1");
  const other = await api(`/orders/${owner.orderId}`, { token: otherToken });
  assert.equal(other.status, 404);
});

test("token sai hoặc hết hạn bị từ chối bằng 401 kèm mã lỗi", async () => {
  const expired = sign(
    { email: owner.email, exp: Math.floor(Date.now() / 1000) - 30 },
    SECRET,
    { subject: owner.userId },
  );
  const wrongKey = sign({ email: owner.email }, "khoa-khac-".padEnd(40, "z"), {
    subject: owner.userId,
    expiresIn: 60,
  });
  const cases: [string, string, string][] = [
    ["hết hạn", expired, "TOKEN_EXPIRED"],
    ["sai khóa", wrongKey, "TOKEN_INVALID"],
    ["rác", "khong.phai.jwt", "TOKEN_INVALID"],
  ];
  for (const [name, token, code] of cases) {
    const result = await api("/orders/me", { token });
    assert.equal(result.status, 401, name);
    assert.equal(result.body.code, code, name);
  }
});
