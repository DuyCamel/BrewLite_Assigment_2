// TV4 — Test previewOrder (xem giá tạm) và các chốt chặn đầu vào dùng chung với createOrder.
// previewOrder tính giống hệt createOrder nhưng KHÔNG ghi DB và KHÔNG giữ tồn.
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { BadRequestException } from "@nestjs/common";
import { InventoryModel } from "../src/models/inventory.model";
import { OrderModel } from "../src/models/order.model";
import { PromotionModel } from "../src/models/promotion.model";
import { InventoryService } from "../src/services/inventory.service";
import { OrdersService } from "../src/services/orders.service";
import { PromotionsService } from "../src/services/promotions.service";
import type { CreateOrderInput } from "../src/types/contracts";
import {
  EXTRA_M,
  PRODUCT_ID,
  TOPPING_TC,
  UNIT_S,
  USER_ID,
  countOrders,
  createTestDb,
  insertPromotion,
  makeFakeDatabase,
  readStock,
  setStock,
} from "./tv4-helpers";

let db: PGlite;
let service: OrdersService;

before(async () => {
  db = await createTestDb();
  const fakeDb = makeFakeDatabase(db);
  const promotions = new PromotionsService(new PromotionModel(fakeDb));
  service = new OrdersService(
    fakeDb,
    new OrderModel(),
    new InventoryService(new InventoryModel()),
    promotions,
  );
  await insertPromotion(db, { id: "tv4-promo-pct", code: "TV4PCT10", type: "PERCENT", value: 10 });
});
after(async () => {
  await db.close();
});
beforeEach(async () => {
  await setStock(db, 10);
});

const input = (overrides: Partial<CreateOrderInput> = {}): CreateOrderInput => ({
  items: [
    { productId: PRODUCT_ID, size: "M", toppingIds: ["tc"], quantity: 2 },
    { productId: PRODUCT_ID, size: "S", toppingIds: [], quantity: 1 },
  ],
  ...overrides,
});

test("previewOrder tính từng dòng và tổng tiền từ DB, không ghi đơn và không đụng tồn", async () => {
  const ordersBefore = await countOrders(db);
  const preview = await service.previewOrder(input());

  const unitM = UNIT_S + EXTRA_M + TOPPING_TC;
  assert.deepEqual(preview.items, [
    {
      productId: PRODUCT_ID,
      productName: "Trà TV4",
      size: "M",
      toppingIds: ["tc"],
      quantity: 2,
      unitPrice: unitM,
      lineTotal: unitM * 2,
    },
    {
      productId: PRODUCT_ID,
      productName: "Trà TV4",
      size: "S",
      toppingIds: [],
      quantity: 1,
      unitPrice: UNIT_S,
      lineTotal: UNIT_S,
    },
  ]);
  assert.equal(preview.subtotal, unitM * 2 + UNIT_S);
  assert.equal(preview.discount, 0);
  assert.equal(preview.total, preview.subtotal);

  assert.equal(await countOrders(db), ordersBefore, "xem giá không được tạo đơn");
  assert.equal(await readStock(db), 10, "xem giá không được trừ tồn");
});

test("previewOrder và createOrder cho cùng một mức giá (kể cả khi có mã giảm giá)", async () => {
  const request = input({ promotionCode: " tv4pct10 " });
  const preview = await service.previewOrder(request);
  const created = await service.createOrder(USER_ID, request);
  assert.equal(preview.discount, 8400); // 10% của 84.000
  assert.equal(created.subtotal, preview.subtotal);
  assert.equal(created.discount, preview.discount);
  assert.equal(created.total, preview.total);
});

test("previewOrder vẫn cho xem giá khi hết hàng (không kiểm tra tồn)", async () => {
  await setStock(db, 0);
  const preview = await service.previewOrder(input());
  assert.equal(preview.total, (UNIT_S + EXTRA_M + TOPPING_TC) * 2 + UNIT_S);
  assert.equal(await readStock(db), 0);
});

test("previewOrder từ chối đầu vào sai giống createOrder (400)", async () => {
  const bad: Array<[string, unknown]> = [
    ["items rỗng", { items: [] }],
    ["thiếu items", {}],
    ["items không phải mảng", { items: "abc" }],
    ["dòng null", { items: [null] }],
    ["số lượng 0", { items: [{ productId: PRODUCT_ID, size: "S", toppingIds: [], quantity: 0 }] }],
    ["sản phẩm không tồn tại", { items: [{ productId: "khong-co", size: "S", toppingIds: [], quantity: 1 }] }],
    ["size không thuộc món", { items: [{ productId: PRODUCT_ID, size: "XL", toppingIds: [], quantity: 1 }] }],
    ["mã giảm giá không phải chuỗi", { ...input(), promotionCode: 123 }],
  ];
  for (const [name, body] of bad) {
    await assert.rejects(
      () => service.previewOrder(body as CreateOrderInput),
      BadRequestException,
      `previewOrder: ${name}`,
    );
    await assert.rejects(
      () => service.createOrder(USER_ID, body as CreateOrderInput),
      BadRequestException,
      `createOrder: ${name}`,
    );
  }
});