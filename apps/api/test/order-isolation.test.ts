// TV4 — Đường thanh toán SePay (QR) cũng chỉ được ảnh hưởng đúng đơn trùng mã DH: các đơn PENDING khác của
// cùng khách phải còn nguyên (không PAID, không bị hủy, tồn vẫn được giữ), kể cả khi job hết hạn chạy ngay sau đó.
// Phủ mục "thanh toán thành công không được hủy lan sang đơn khác" trong phân công TV4.
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { InventoryModel } from "../src/models/inventory.model.js";
import { LoyaltyModel } from "../src/models/loyalty.model.js";
import { OrderModel } from "../src/models/order.model.js";
import { PaymentModel } from "../src/models/payment.model.js";
import { PromotionModel } from "../src/models/promotion.model.js";
import { MockPaymentGateway } from "../src/gateways/mock-payment.gateway.js";
import { InventoryService } from "../src/services/inventory.service.js";
import { LoyaltyService } from "../src/services/loyalty.service.js";
import { OrdersService } from "../src/services/orders.service.js";
import { PaymentsService } from "../src/services/payments.service.js";
import { PromotionsService } from "../src/services/promotions.service.js";
import { SepayModel } from "../src/sepay/sepay.model.js";
import { SepayService } from "../src/sepay/sepay.services.js";
import {
  PRODUCT_ID,
  USER_ID,
  createTestDb,
  makeFakeDatabase,
  readStock,
  setStock,
} from "./tv4-helpers.js";

const API_KEY = "test-webhook-key";
const AUTH = `Apikey ${API_KEY}`;

let db: PGlite;
let orders: OrdersService;
let payments: PaymentsService;
let sepay: SepayService;
let previousKey: string | undefined;
let nextTransactionId = 9_000_000;

before(async () => {
  previousKey = process.env.SEPAY_WEBHOOK_API_KEY;
  process.env.SEPAY_WEBHOOK_API_KEY = API_KEY;
  db = await createTestDb();
  const fakeDb = makeFakeDatabase(db);
  orders = new OrdersService(
    fakeDb,
    new OrderModel(),
    new InventoryService(new InventoryModel()),
    new PromotionsService(new PromotionModel(fakeDb)),
  );
  payments = new PaymentsService(
    fakeDb,
    new PaymentModel(fakeDb),
    new OrderModel(),
    new MockPaymentGateway(),
    new InventoryService(new InventoryModel()),
    new LoyaltyService(new LoyaltyModel()),
  );
  sepay = new SepayService(fakeDb, new SepayModel());
  // Dọn các đơn PENDING đã quá hạn sẵn trong dữ liệu seed để các assert đếm chỉ tính đơn của test.
  await orders.expirePendingOrders();
});
after(async () => {
  if (previousKey === undefined) delete process.env.SEPAY_WEBHOOK_API_KEY;
  else process.env.SEPAY_WEBHOOK_API_KEY = previousKey;
  await db.close();
});
beforeEach(async () => {
  await setStock(db, 20);
});

async function place(quantity = 1) {
  const created = await orders.createOrder(USER_ID, {
    items: [{ productId: PRODUCT_ID, size: "S", toppingIds: [], quantity }],
  });
  const row = await db.query<{ payment_code: string; total: number }>(
    "SELECT payment_code, total FROM orders WHERE id = $1",
    [created.orderId],
  );
  return {
    id: created.orderId,
    code: row.rows[0].payment_code,
    total: row.rows[0].total,
  };
}

async function statusOf(orderId: string): Promise<string> {
  const result = await db.query<{ status: string }>(
    "SELECT status FROM orders WHERE id = $1",
    [orderId],
  );
  return result.rows[0].status;
}

const transfer = (code: string, amount: number) => ({
  id: nextTransactionId++,
  gateway: "MSB",
  transactionDate: "2026-11-10 10:30:00",
  accountNumber: "0000000001",
  subAccount: null,
  code,
  content: `${code} thanh toan don hang`,
  transferType: "in",
  transferAmount: amount,
  referenceCode: `SB${nextTransactionId}`,
});

test("SePay trả đúng mã DH của đơn A: chỉ A thành PAID, đơn B và C của cùng khách còn PENDING và còn giữ tồn", async () => {
  const a = await place();
  const b = await place();
  const c = await place();
  assert.equal(await readStock(db), 17);

  const result = await sepay.receiveWebhook(transfer(a.code, a.total), AUTH);
  assert.equal(result.orderId, a.id);
  assert.equal(result.duplicate, false);

  assert.equal(await statusOf(a.id), "PAID");
  assert.equal(await statusOf(b.id), "PENDING");
  assert.equal(await statusOf(c.id), "PENDING");
  assert.equal(await readStock(db), 17, "tồn của B và C vẫn đang được giữ");

  // Đúng một khoản thanh toán và một lần cộng điểm, chỉ gắn với đơn A.
  const payments = await db.query<{ order_id: string }>(
    "SELECT order_id FROM payments WHERE order_id = ANY($1)",
    [[a.id, b.id, c.id]],
  );
  assert.deepEqual(payments.rows.map((r) => r.order_id), [a.id]);
  const earns = await db.query<{ order_id: string }>(
    "SELECT order_id FROM loyalty_transactions WHERE order_id = ANY($1)",
    [[a.id, b.id, c.id]],
  );
  assert.deepEqual(earns.rows.map((r) => r.order_id), [a.id]);

  // Job hết hạn chạy ngay sau thanh toán: chưa đơn nào quá hạn nên không đơn nào bị hủy.
  assert.equal(await orders.expirePendingOrders(), 0);
  assert.equal(await statusOf(a.id), "PAID");
  assert.equal(await statusOf(b.id), "PENDING");
  assert.equal(await statusOf(c.id), "PENDING");
});

test("mock payment chốt đúng đơn A, retry không cộng điểm trùng và không hủy các đơn PENDING khác", async () => {
  const a = await place();
  const b = await place();
  const c = await place();
  const paymentId = "payment-isolation-tv4";
  await db.query(
    `INSERT INTO payments (id, order_id, amount, method, idempotency_key, payload_hash, status)
     VALUES ($1, $2, $3, 'CARD', $4, $5, 'PROCESSING')`,
    [paymentId, a.id, a.total, "key-isolation-tv4", "a".repeat(64)],
  );

  await payments.finalizePayment(paymentId, "SUCCEEDED", USER_ID, a.id, a.total);
  await payments.finalizePayment(paymentId, "SUCCEEDED", USER_ID, a.id, a.total);

  assert.equal(await statusOf(a.id), "PAID");
  assert.equal(await statusOf(b.id), "PENDING");
  assert.equal(await statusOf(c.id), "PENDING");
  assert.equal(await readStock(db), 17);
  assert.equal(
    (await db.query("SELECT id FROM payments WHERE order_id = $1", [a.id])).rows.length,
    1,
  );
  assert.equal(
    (await db.query("SELECT id FROM loyalty_transactions WHERE order_id = $1", [a.id])).rows.length,
    1,
  );
  assert.equal(await orders.expirePendingOrders(), 0);
  assert.equal(await statusOf(b.id), "PENDING");
  assert.equal(await statusOf(c.id), "PENDING");
});

test("SePay gửi sai số tiền hoặc mã DH không tồn tại: bị từ chối và không đơn nào đổi trạng thái hay mất tồn", async () => {
  const a = await place();
  const b = await place();

  await assert.rejects(() => sepay.receiveWebhook(transfer(a.code, a.total + 1), AUTH));
  await assert.rejects(() => sepay.receiveWebhook(transfer("DH99999999", a.total), AUTH));

  assert.equal(await statusOf(a.id), "PENDING");
  assert.equal(await statusOf(b.id), "PENDING");
  assert.equal(await readStock(db), 18);
});

test("webhook gửi lại cùng giao dịch (replay): không tạo thêm thanh toán và không đụng đơn khác", async () => {
  const a = await place();
  const b = await place();
  const hook = transfer(a.code, a.total);

  const first = await sepay.receiveWebhook(hook, AUTH);
  const replay = await sepay.receiveWebhook(hook, AUTH);
  assert.equal(first.duplicate, false);
  assert.equal(replay.duplicate, true);

  const payments = await db.query("SELECT id FROM payments WHERE order_id = $1", [a.id]);
  assert.equal(payments.rows.length, 1);
  assert.equal(await statusOf(a.id), "PAID");
  assert.equal(await statusOf(b.id), "PENDING");
});