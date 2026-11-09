// TV4 — Test OrdersController qua HTTP thật: guard JWT, @Inject của service, và ánh xạ lỗi 401/404/409.
// Dựng một module nhỏ chỉ có controller + các lớp thật của TV4, DB là PGlite (giống order-service.test.ts).
// AuthService được thay bằng bản giả để không cần JWT_SECRET: token "token-<userId>" hợp lệ, còn lại bị 401.
import "reflect-metadata";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import {
  Module,
  UnauthorizedException,
  type INestApplication,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DatabaseService } from "../src/config/db";
import { OrdersController } from "../src/controllers/customer/orders.controller";
import { JwtAuthGuard } from "../src/guards/jwt-auth.guard";
import { InventoryModel } from "../src/models/inventory.model";
import { OrderModel } from "../src/models/order.model";
import { PromotionModel } from "../src/models/promotion.model";
import { AuthService } from "../src/services/auth.service";
import { InventoryService } from "../src/services/inventory.service";
import { OrdersService } from "../src/services/orders.service";
import { PromotionsService } from "../src/services/promotions.service";
import {
  PRODUCT_ID,
  USER_ID,
  createTestDb,
  makeFakeDatabase,
  readOrder,
  readStock,
} from "./tv4-helpers";

const OTHER_USER_ID = "demo-user-02";

const fakeAuth = {
  verifyAccessToken(token: string) {
    if (token.startsWith("token-")) {
      const id = token.slice("token-".length);
      return { id, email: `${id}@brewlite.test` };
    }
    throw new UnauthorizedException({ statusCode: 401, code: "TOKEN_INVALID" });
  },
};

let db: PGlite;
let app: INestApplication;
let origin: string;

before(async () => {
  db = await createTestDb();
  const fakeDb = makeFakeDatabase(db);

  @Module({
    controllers: [OrdersController],
    providers: [
      { provide: DatabaseService, useValue: fakeDb },
      { provide: AuthService, useValue: fakeAuth },
      JwtAuthGuard,
      OrderModel,
      InventoryModel,
      InventoryService,
      PromotionModel,
      PromotionsService,
      OrdersService,
    ],
  })
  class TestModule {}

  app = await NestFactory.create(TestModule, { logger: false });
  await app.listen(0, "127.0.0.1");
  origin = await app.getUrl();
});

after(async () => {
  await app?.close();
});

function post(path: string, token: string | null, body?: unknown) {
  return fetch(`${origin}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const validBody = {
  items: [{ productId: PRODUCT_ID, size: "S", toppingIds: [], quantity: 2 }],
};

test("thiếu hoặc sai token: POST /orders và /orders/:id/cancel trả 401", async () => {
  for (const [path, body] of [
    ["/orders", validBody],
    ["/orders/abc/cancel", undefined],
  ] as const) {
    assert.equal((await post(path, null, body)).status, 401, `${path} không token`);
    assert.equal((await post(path, "rac", body)).status, 401, `${path} token rác`);
  }
});

test("POST /orders: tạo đơn qua HTTP, tính giá từ DB và trừ tồn", async () => {
  const stockBefore = await readStock(db);
  const response = await post("/orders", `token-${USER_ID}`, validBody);
  assert.equal(response.status, 201);
  const created = (await response.json()) as {
    orderId: string;
    status: string;
    total: number;
  };
  assert.equal(created.status, "PENDING");
  assert.equal(created.total, 40000); // 2 ly size S, mỗi ly 20.000
  assert.equal(await readStock(db), stockBefore - 2);
  const order = await readOrder(db, created.orderId);
  assert.equal(order.user_id, USER_ID, "đơn phải thuộc user trong token");
});

test("POST /orders: body thiếu items trả 400", async () => {
  const response = await post("/orders", `token-${USER_ID}`, { items: [] });
  assert.equal(response.status, 400);
});

test("hủy đơn: người lạ 404, chủ đơn hủy được và hoàn tồn, hủy lại 409", async () => {
  const stockBefore = await readStock(db);
  const created = (await (
    await post("/orders", `token-${USER_ID}`, validBody)
  ).json()) as { orderId: string };
  assert.equal(await readStock(db), stockBefore - 2);

  const stranger = await post(`/orders/${created.orderId}/cancel`, `token-${OTHER_USER_ID}`);
  assert.equal(stranger.status, 404, "đơn của người khác phải báo không tìm thấy");

  const mine = await post(`/orders/${created.orderId}/cancel`, `token-${USER_ID}`);
  assert.equal(mine.status, 201);
  assert.deepEqual(await mine.json(), { orderId: created.orderId, status: "CANCELLED" });
  assert.equal(await readStock(db), stockBefore, "hủy phải hoàn đúng tồn");

  const again = await post(`/orders/${created.orderId}/cancel`, `token-${USER_ID}`);
  assert.equal(again.status, 409);
  assert.equal(await readStock(db), stockBefore, "hủy lại không được hoàn tồn lần nữa");
});

test("hủy đơn không tồn tại trả 404", async () => {
  const response = await post("/orders/khong-co-don-nay/cancel", `token-${USER_ID}`);
  assert.equal(response.status, 404);
});