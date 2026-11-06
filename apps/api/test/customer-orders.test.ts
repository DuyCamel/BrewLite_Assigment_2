// TV6 — Test quy tắc trạng thái, service đọc đơn (model giả) và API khi chưa có JWT.
import "reflect-metadata";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  type INestApplication,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module.js";
import { OrderStateService } from "../src/services/order-state.service.js";
import { CustomerOrdersService } from "../src/services/customer-orders.service.js";
import type { CustomerOrderModel } from "../src/models/customer-order.model.js";
import type { OrderStatus } from "../src/types/contracts.js";

const ALL: OrderStatus[] = [
  "PENDING",
  "PAYMENT_FAILED",
  "PAID",
  "PREPARING",
  "READY",
  "COMPLETED",
  "CANCELLED",
];
// Đúng 8 cạnh của guard_order_change trong 002_integrity.sql.
const EDGES = new Set([
  "PENDING>PAID",
  "PENDING>PAYMENT_FAILED",
  "PENDING>CANCELLED",
  "PAYMENT_FAILED>PENDING",
  "PAYMENT_FAILED>CANCELLED",
  "PAID>PREPARING",
  "PREPARING>READY",
  "READY>COMPLETED",
]);

const state = new OrderStateService({} as CustomerOrderModel);

test("bảng chuyển trạng thái khớp đúng 8 cạnh của DB, mọi cặp khác bị chặn", () => {
  for (const from of ALL) {
    for (const to of ALL) {
      assert.equal(
        state.canTransition(from, to),
        EDGES.has(`${from}>${to}`),
        `${from} -> ${to}`,
      );
    }
  }
});

test("assertTransition ném 409 khi sai cạnh hoặc cùng trạng thái", () => {
  assert.throws(
    () => state.assertTransition("PAID", "CANCELLED"),
    ConflictException,
  );
  assert.throws(
    () => state.assertTransition("PENDING", "PENDING"),
    ConflictException,
  );
  assert.doesNotThrow(() => state.assertTransition("PENDING", "PAID"));
});

test("canCancel / canRetryPayment / isPaid", () => {
  assert.equal(state.canCancel("PENDING", false), true);
  assert.equal(state.canCancel("PENDING", true), false); // đang PROCESSING
  assert.equal(state.canCancel("PAYMENT_FAILED", false), true);
  assert.equal(state.canCancel("PAID", false), false);
  assert.equal(state.canCancel("CANCELLED", false), false);
  assert.equal(state.canRetryPayment("PAYMENT_FAILED"), true);
  assert.equal(state.canRetryPayment("PENDING"), false);
  assert.equal(state.isPaid("PREPARING"), true);
  assert.equal(state.isPaid("PENDING"), false);
});

function fakeStateModel(current: OrderStatus | undefined, casResult = true) {
  const updates: string[] = [];
  const model = {
    lockStatus: async () => current,
    updateStatus: async (
      _client: unknown,
      _id: string,
      from: OrderStatus,
      to: OrderStatus,
    ) => {
      updates.push(`${from}>${to}`);
      return casResult;
    },
  } as unknown as CustomerOrderModel;
  return { model, updates };
}

test("transitionOrder: thành công trả trạng thái cũ", async () => {
  const { model, updates } = fakeStateModel("PENDING");
  const result = await new OrderStateService(model).transitionOrder(
    {} as never,
    "o1",
    "CANCELLED",
  );
  assert.equal(result, "PENDING");
  assert.deepEqual(updates, ["PENDING>CANCELLED"]);
});

test("transitionOrder: không có đơn → 404; sai cạnh → 409 và không UPDATE; CAS thua → 409", async () => {
  const missing = fakeStateModel(undefined);
  await assert.rejects(
    new OrderStateService(missing.model).transitionOrder(
      {} as never,
      "x",
      "PAID",
    ),
    NotFoundException,
  );
  const invalid = fakeStateModel("PAID");
  await assert.rejects(
    new OrderStateService(invalid.model).transitionOrder(
      {} as never,
      "o1",
      "CANCELLED",
    ),
    ConflictException,
  );
  assert.deepEqual(invalid.updates, []);
  const raced = fakeStateModel("PENDING", false);
  await assert.rejects(
    new OrderStateService(raced.model).transitionOrder(
      {} as never,
      "o1",
      "PAID",
    ),
    ConflictException,
  );
});

const row = (id: string) => ({
  id,
  payment_code: "DH00000001",
  status: "PENDING" as OrderStatus,
  subtotal: 70000,
  discount: 0,
  total: 70000,
  item_count: 2,
  payment_status: null,
  created_at: new Date("2026-10-20T10:00:00Z"),
  expires_at: new Date("2026-10-20T10:15:00Z"),
});

function serviceWith(model: Partial<CustomerOrderModel>) {
  return new CustomerOrdersService(model as CustomerOrderModel, state);
}

test("getMyOrders: truyền userId + limit+1, cắt dư và báo hasMore", async () => {
  const calls: unknown[][] = [];
  const service = serviceWith({
    findSummariesByUser: async (...args: unknown[]) => {
      calls.push(args);
      return [row("a"), row("b"), row("c")];
    },
  } as Partial<CustomerOrderModel>);
  const page = await service.getMyOrders("u1", "2", "4");
  assert.deepEqual(calls, [["u1", 3, 4]]);
  assert.equal(page.orders.length, 2);
  assert.equal(page.orders[0].paymentCode, "DH00000001");
  assert.equal(page.hasMore, true);
  assert.equal(page.orders[0].createdAt, "2026-10-20T10:00:00.000Z");
});

test("getMyOrders: limit/offset sai → 400, mặc định limit 20", async () => {
  const calls: unknown[][] = [];
  const service = serviceWith({
    findSummariesByUser: async (...args: unknown[]) => {
      calls.push(args);
      return [];
    },
  } as Partial<CustomerOrderModel>);
  for (const bad of ["0", "51", "abc", "1.5", "-1"]) {
    await assert.rejects(
      service.getMyOrders("u1", bad),
      BadRequestException,
      bad,
    );
  }
  await assert.rejects(
    service.getMyOrders("u1", "5", "-1"),
    BadRequestException,
  );
  await service.getMyOrders("u1");
  assert.deepEqual(calls, [["u1", 21, 0]]);
});

test("getOrderDetail: 404 khi không thuộc user, 400 khi mã rỗng, canCancel=false khi PROCESSING", async () => {
  const detailRow = {
    ...row("o1"),
    promotion_code: null,
    points_earned: null,
    items: [],
    payments: [
      {
        id: "p1",
        method: "CARD" as const,
        status: "PROCESSING" as const,
        amount: 70000,
        createdAt: "2026-10-20T10:01:00+00:00",
        resolvedAt: null,
      },
    ],
  };
  const service = serviceWith({
    findDetailForUser: async (id: string, userId: string) =>
      id === "o1" && userId === "u1" ? detailRow : undefined,
  } as Partial<CustomerOrderModel>);
  await assert.rejects(service.getOrderDetail("u2", "o1"), NotFoundException);
  await assert.rejects(
    service.getOrderDetail("u1", "   "),
    BadRequestException,
  );
  const detail = await service.getOrderDetail("u1", "o1");
  assert.equal(detail.paymentCode, "DH00000001");
  assert.equal(detail.canCancel, false);
  assert.equal(detail.canRetryPayment, false);
  assert.equal(detail.payments[0].createdAt, "2026-10-20T10:01:00.000Z");
});

let app: INestApplication;
let origin: string;
before(async () => {
  process.env.PRODUCT_DATA_SOURCE = "sample";
  app = await NestFactory.create(AppModule, { logger: false });
  await app.listen(0, "127.0.0.1");
  origin = await app.getUrl();
});
after(async () => {
  await app?.close();
});

test("GET /orders/me và /orders/:id trả 401 khi chưa có JWT (API đóng, không lộ dữ liệu)", async () => {
  for (const path of ["/orders/me", "/orders/abc"]) {
    const response = await fetch(`${origin}${path}`);
    assert.equal(response.status, 401, path);
  }
});
