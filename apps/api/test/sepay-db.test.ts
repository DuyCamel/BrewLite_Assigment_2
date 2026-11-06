import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { PoolClient } from "pg";
import type { DatabaseService } from "../src/config/db.js";
import { CustomerOrderModel } from "../src/models/customer-order.model.js";
import { OrderModel } from "../src/models/order.model.js";
import { SepayModel } from "../src/sepay/sepay.model.js";
import { SepayService } from "../src/sepay/sepay.services.js";

test("simulated SePay transfer pays an order once after database commit", async () => {
  const pg = new PGlite();
  const previousKey = process.env.SEPAY_WEBHOOK_API_KEY;
  process.env.SEPAY_WEBHOOK_API_KEY = "test-webhook-key";
  try {
    await pg.exec(readFileSync(new URL("../database/001_schema.sql", import.meta.url), "utf8"));
    await pg.exec(readFileSync(new URL("../database/007_order_payment_codes.sql", import.meta.url), "utf8"));
    await pg.exec(`INSERT INTO users (id, email, password_hash, display_name)
      VALUES ('customer-1', 'test@example.com', '$2b$10$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'Customer');
      INSERT INTO products (id, name, category, price, sizes)
      VALUES ('drink-1', 'Drink', 'Drinks', 80000, '[{"name":"S","extraPrice":0}]');`);
    await pg.exec("BEGIN");
    const inserted = await new OrderModel().insertOrder({
      id: "order-1", userId: "customer-1", subtotal: 80000,
      discount: 0, total: 80000, promotionId: null,
    }, pg as unknown as PoolClient);
    await pg.exec(`INSERT INTO order_items (id, order_id, product_id, product_name, size, quantity, unit_price, line_total)
      VALUES ('item-1', 'order-1', 'drink-1', 'Drink', 'S', 1, 80000, 80000);`);
    await pg.exec("COMMIT");
    const code = (await pg.query<{ payment_code: string }>(
      "SELECT payment_code FROM orders WHERE id = 'order-1'",
    )).rows[0].payment_code;
    assert.equal(inserted.paymentCode, code);
    const detailModel = new CustomerOrderModel({
      query: (sql: string, params: unknown[]) => pg.query(sql, params),
    } as DatabaseService);
    const detail = await detailModel.findDetailForUser("order-1", "customer-1");
    assert.equal(detail?.payment_code, code);
    const summaries = await detailModel.findSummariesByUser("customer-1", 2, 0);
    assert.equal(summaries[0].payment_code, code);
    const client = pg as unknown as PoolClient;
    const db = {
      withTransaction: async <T>(operation: (transaction: PoolClient) => Promise<T>) => {
        await pg.exec("BEGIN");
        try {
          const result = await operation(client);
          await pg.exec("COMMIT");
          return result;
        } catch (error) {
          await pg.exec("ROLLBACK");
          throw error;
        }
      },
    } as DatabaseService;
    const service = new SepayService(db, new SepayModel());
    const webhook = {
      id: 12345,
      gateway: "MSB",
      transactionDate: "2026-11-05 10:30:00",
      accountNumber: "0000000001",
      subAccount: "SBSEPAY354HYTS9068D",
      code,
      content: `${code} thanh toan don hang`,
      transferType: "in",
      transferAmount: 80000,
      referenceCode: "SB1A2B3C4D5E",
    };
    const first = await service.receiveWebhook(webhook, "Apikey test-webhook-key");
    const replay = await service.receiveWebhook(webhook, "Apikey test-webhook-key");
    assert.equal(first.orderId, "order-1");
    assert.equal(first.duplicate, false);
    assert.equal(replay.duplicate, true);
    const order = await pg.query<{ status: string }>("SELECT status FROM orders WHERE id = 'order-1'");
    assert.equal(order.rows[0].status, "PAID");
    const payments = await pg.query("SELECT id FROM payments WHERE order_id = 'order-1'");
    assert.equal(payments.rows.length, 1);
    const earns = await pg.query("SELECT id FROM loyalty_transactions WHERE order_id = 'order-1'");
    assert.equal(earns.rows.length, 1);
  } finally {
    if (previousKey === undefined) delete process.env.SEPAY_WEBHOOK_API_KEY;
    else process.env.SEPAY_WEBHOOK_API_KEY = previousKey;
    await pg.close();
  }
});
