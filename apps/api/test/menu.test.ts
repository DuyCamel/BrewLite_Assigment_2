import "reflect-metadata";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module.js";
import { ProductsService } from "../src/services/products.service.js";
import { ProductModel } from "../src/models/product.model.js";
import { DatabaseService } from "../src/config/db.js";
import jsonwebtoken from "jsonwebtoken";
const { sign } = jsonwebtoken;
let app: INestApplication;
let origin: string;

before(async () => {
  process.env.PRODUCT_DATA_SOURCE = "sample";
  process.env.JWT_SECRET = "test-secret-for-brewlite-menu-0123456789abcdef";
  app = await NestFactory.create(AppModule, { logger: false });
  await app.listen(0, "127.0.0.1");
  origin = await app.getUrl();
});

after(async () => {
  await app?.close();
});

test("GET /products trả menu từ seed, tiền nguyên và ảnh hợp lệ", async () => {
  const response = await fetch(`${origin}/products`);
  assert.equal(response.status, 200);
  const rows = await response.json();
  assert.equal(rows.length, 36);
  assert.equal(new Set(rows.map((p: { id: string }) => p.id)).size, 36);
  for (const row of rows) {
    assert.ok(Number.isInteger(row.price) && row.price > 0);
    assert.ok(row.imageUrl === null || typeof row.imageUrl === "string");
    assert.ok(row.sizes.length > 0);
  }
});

test("GET /products/:id trả chi tiết món và 404 khi không tìm thấy", async () => {
  const okRes = await fetch(`${origin}/products/ca-phe-sua`);
  assert.equal(okRes.status, 200);
  const product = (await okRes.json()) as { id: string };
  assert.equal(product.id, "ca-phe-sua");

  const notFoundRes = await fetch(`${origin}/products/abc`);
  assert.equal(notFoundRes.status, 404);
});

test("health không giả vờ đã kiểm tra DB trong sample mode", async () => {
  const response = await fetch(`${origin}/health`);
  assert.deepEqual(await response.json(), {
    status: "ok",
    dataSource: "sample",
    database: "not-checked",
  });
});
test("API bảo vệ đơn hàng và thanh toán bằng xác thực", async () => {
  const ordersResponse = await fetch(`${origin}/orders`, { method: "POST" });
  assert.equal(ordersResponse.status, 401);
  const paymentsResponse = await fetch(`${origin}/payments`, {
    method: "POST",
  });
  assert.equal(paymentsResponse.status, 401);
  const productResponse = await fetch(`${origin}/products/abc`);
  assert.equal(productResponse.status, 404);
});


test("API còn khung trả 501, không nhận thanh toán giả", async () => {
  for (const [path, method] of [
    ["/orders", "POST"],
    ["/payments", "POST"],
  ]) {
    const response = await fetch(`${origin}${path}`, { method });
    assert.equal(response.status, 501, path);
  }
});
function postJson(path: string, body: unknown) {
  return fetch(`${origin}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
test("auth: kiểm tra dữ liệu trước (400), sample mode không giả lập tài khoản (503)", async () => {
  assert.equal((await postJson("/auth/login", {})).status, 400);
  assert.equal(
    (await postJson("/auth/register", { email: "a@b.co", password: "ngan" }))
      .status,
    400,
  );
  const body = await (await postJson("/auth/login", {})).json();
  assert.equal(body.code, "VALIDATION_FAILED");
  assert.ok(body.errors.email && body.errors.password);
  for (const path of ["/auth/login", "/auth/register"])
    assert.equal(
      (await postJson(path, { email: "a@b.co", password: "BrewLite123!" }))
        .status,
      503,
      path,
    );
});
test("GET /auth/me cần JWT: thiếu/sai token trả 401 kèm mã lỗi, token đúng qua guard", async () => {
  const missing = await fetch(`${origin}/auth/me`);
  assert.equal(missing.status, 401);
  assert.equal((await missing.json()).code, "TOKEN_MISSING");
  const bad = await fetch(`${origin}/auth/me`, {
    headers: { authorization: "Bearer khong.phai.jwt" },
  });
  assert.equal(bad.status, 401);
  assert.equal((await bad.json()).code, "TOKEN_INVALID");
  const token = sign({ email: "a@b.co" }, process.env.JWT_SECRET ?? "", {
    subject: "u1",
    expiresIn: 60,
  });
  // Qua guard thì tới service; sample mode không có DB nên 503, quan trọng là không còn 401.
  const ok = await fetch(`${origin}/auth/me`, {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(ok.status, 503);
});
test("postgres model dùng query và không tự fallback seed khi DB lỗi", async () => {
  const db = new DatabaseService();
  const model = new ProductModel(db);
  const original = process.env.PRODUCT_DATA_SOURCE;
  try {
    process.env.PRODUCT_DATA_SOURCE = "postgres";
    db.query = async () => {
      throw new Error("DB down, sensitive connection details");
    };
    await assert.rejects(new ProductsService(model).getProducts(), (error) => {
      assert.ok(error instanceof Error);
      assert.ok(!error.message.includes("sensitive"));
      assert.ok(error.message.includes("Không tải được menu"));
      return true;
    });
  } finally {
    process.env.PRODUCT_DATA_SOURCE = original;
    await db.onModuleDestroy();
  }
});
