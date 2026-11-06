import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { PoolClient } from "pg";
import { DatabaseService } from "../src/config/db.js";
import { SepayModel } from "../src/sepay/sepay.model.js";
import { SepayService } from "../src/sepay/sepay.services.js";

const orderId = "654aa817-7ef4-438d-9ef2-34b5f5fa900f";

function createService(isUnexpired = true) {
  const inserted: string[] = [];
  const model = {
    findProviderTransaction: async () => null,
    findOrderForUpdate: async () => ({
      id: orderId,
      status: "PENDING",
      total: 80_000,
      userId: "user-1",
      isUnexpired,
    }),
    insertProcessingPayment: async (
      _orderId: string,
      _paymentId: string,
      _key: string,
      _hash: string,
      _amount: number,
      _providerTransactionId: string,
      _providerReference: string | null,
      _payload: unknown,
      _transaction: PoolClient,
    ) => {
      inserted.push("insert");
    },
    markPaymentSucceeded: async () => {
      inserted.push("paid");
    },
    markOrderPaid: async () => {
      inserted.push("order-paid");
    },
    insertEarn: async () => {
      inserted.push("earn");
    },
  } as unknown as SepayModel;
  const db = {
    withTransaction: async <T>(
      operation: (transaction: PoolClient) => Promise<T>,
    ) => operation({} as PoolClient),
  } as unknown as DatabaseService;
  return { service: new SepayService(db, model), inserted };
}

function webhook(content: string, transferAmount = 80_000) {
  return {
    id: 123,
    gateway: "MB",
    transactionDate: "2026-11-02 16:00:00",
    accountNumber: "test-account",
    content,
    transferType: "in" as const,
    transferAmount,
  };
}

test("SePay accepts the UUID-only reference used by older QR codes", async () => {
  const previousKey = process.env.SEPAY_WEBHOOK_API_KEY;
  process.env.SEPAY_WEBHOOK_API_KEY = "test-webhook-key";
  try {
    const { service, inserted } = createService();
    const result = await service.receiveWebhook(
      webhook(orderId),
      "Apikey test-webhook-key",
    );
    assert.equal(result.orderId, orderId);
    assert.deepEqual(inserted, ["insert", "paid", "order-paid", "earn"]);
  } finally {
    if (previousKey === undefined) delete process.env.SEPAY_WEBHOOK_API_KEY;
    else process.env.SEPAY_WEBHOOK_API_KEY = previousKey;
  }
});

test("SePay accepts the BREWLITE-ORDER reference on new QR codes", async () => {
  const previousKey = process.env.SEPAY_WEBHOOK_API_KEY;
  process.env.SEPAY_WEBHOOK_API_KEY = "test-webhook-key";
  try {
    const { service } = createService();
    const result = await service.receiveWebhook(
      webhook(`BREWLITE-ORDER-${orderId}`),
      "Apikey test-webhook-key",
    );
    assert.equal(result.orderId, orderId);
  } finally {
    if (previousKey === undefined) delete process.env.SEPAY_WEBHOOK_API_KEY;
    else process.env.SEPAY_WEBHOOK_API_KEY = previousKey;
  }
});

test("SePay rejects a transfer amount that differs from the order", async () => {
  const previousKey = process.env.SEPAY_WEBHOOK_API_KEY;
  process.env.SEPAY_WEBHOOK_API_KEY = "test-webhook-key";
  try {
    const { service, inserted } = createService();
    await assert.rejects(
      service.receiveWebhook(
        webhook(orderId, 79_999),
        "Apikey test-webhook-key",
      ),
      /Số tiền SePay không khớp tổng đơn/,
    );
    assert.deepEqual(inserted, []);
  } finally {
    if (previousKey === undefined) delete process.env.SEPAY_WEBHOOK_API_KEY;
    else process.env.SEPAY_WEBHOOK_API_KEY = previousKey;
  }
});

test("SePay accepts a DH payment code and resolves the UUID order", async () => {
  const previousKey = process.env.SEPAY_WEBHOOK_API_KEY;
  process.env.SEPAY_WEBHOOK_API_KEY = "test-webhook-key";
  try {
    const { service, inserted } = createService();
    const result = await service.receiveWebhook(
      webhook("DH00000001"),
      "Apikey test-webhook-key",
    );
    assert.equal(result.orderId, orderId);
    assert.deepEqual(inserted, ["insert", "paid", "order-paid", "earn"]);
  } finally {
    if (previousKey === undefined) delete process.env.SEPAY_WEBHOOK_API_KEY;
    else process.env.SEPAY_WEBHOOK_API_KEY = previousKey;
  }
});

test("SePay rejects a transaction after the QR expires", async () => {
  const previousKey = process.env.SEPAY_WEBHOOK_API_KEY;
  process.env.SEPAY_WEBHOOK_API_KEY = "test-webhook-key";
  try {
    const { service, inserted } = createService(false);
    await assert.rejects(
      service.receiveWebhook(
        webhook(`BREWLITE-ORDER-${orderId}`),
        "Apikey test-webhook-key",
      ),
      /Mã QR của đơn đã hết hạn/,
    );
    assert.deepEqual(inserted, []);
  } finally {
    if (previousKey === undefined) delete process.env.SEPAY_WEBHOOK_API_KEY;
    else process.env.SEPAY_WEBHOOK_API_KEY = previousKey;
  }
});

test("DH payment codes backfill old orders and remain unique for new orders", async () => {
  const db = new PGlite();
  try {
    await db.exec("CREATE TABLE orders (id TEXT PRIMARY KEY); INSERT INTO orders (id) VALUES ('old')");
    await db.exec(readFileSync(new URL("../database/007_order_payment_codes.sql", import.meta.url), "utf8"));
    await db.exec("INSERT INTO orders (id) VALUES ('new')");
    const result = await db.query<{ id: string; payment_code: string }>(
      "SELECT id, payment_code FROM orders ORDER BY payment_code",
    );
    assert.deepEqual(result.rows, [
      { id: "old", payment_code: "DH00000001" },
      { id: "new", payment_code: "DH00000002" },
    ]);
    await assert.rejects(
      db.query("INSERT INTO orders (id, payment_code) VALUES ('duplicate', 'DH00000001')"),
    );
  } finally {
    await db.close();
  }
});
