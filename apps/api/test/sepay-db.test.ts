import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { PoolClient } from "pg";
import type { DatabaseService } from "../src/config/db.js";
import { CustomerOrderModel } from "../src/models/customer-order.model.js";
import { OrderModel } from "../src/models/order.model.js";
import { PaymentModel } from "../src/models/payment.model.js";
import { InventoryModel } from "../src/models/inventory.model.js";
import { LoyaltyModel } from "../src/models/loyalty.model.js";
import { MockPaymentGateway } from "../src/gateways/mock-payment.gateway.js";
import { PaymentsService } from "../src/services/payments.service.js";
import { InventoryService } from "../src/services/inventory.service.js";
import { LoyaltyService } from "../src/services/loyalty.service.js";
import { SepayModel } from "../src/sepay/sepay.model.js";
import { SepayService } from "../src/sepay/sepay.services.js";

for (const confirm of [false, true]) {
  test(`simulated SePay transfer pays once ${confirm ? "after UI confirmation" : "without a UI session"}`, async () => {
    const pg = new PGlite();
    const previousKey = process.env.SEPAY_WEBHOOK_API_KEY;
    process.env.SEPAY_WEBHOOK_API_KEY = "test-webhook-key";
    try {
      await pg.exec(
        readFileSync(
          new URL("../database/001_schema.sql", import.meta.url),
          "utf8",
        ),
      );
      await pg.exec(
        readFileSync(
          new URL("../database/007_order_payment_codes.sql", import.meta.url),
          "utf8",
        ),
      );
      await pg.exec(
        readFileSync(
          new URL("../database/009_qr_reissue.sql", import.meta.url),
          "utf8",
        ),
      );
      await pg.exec(
        readFileSync(
          new URL("../database/011_sepay_payment_method.sql", import.meta.url),
          "utf8",
        ),
      );
      await pg.exec(`INSERT INTO users (id, email, password_hash, display_name)
      VALUES ('customer-1', 'test@example.com', '$2b$10$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'Customer');
      INSERT INTO products (id, name, category, price, sizes)
      VALUES ('drink-1', 'Drink', 'Drinks', 80000, '[{"name":"S","extraPrice":0}]');`);
      await pg.exec("BEGIN");
      const inserted = await new OrderModel().insertOrder(
        {
          id: "order-1",
          userId: "customer-1",
          subtotal: 80000,
          discount: 0,
          total: 80000,
          promotionId: null,
        },
        pg as unknown as PoolClient,
      );
      await pg.exec(`INSERT INTO order_items (id, order_id, product_id, product_name, size, quantity, unit_price, line_total)
      VALUES ('item-1', 'order-1', 'drink-1', 'Drink', 'S', 1, 80000, 80000);`);
      await pg.exec("COMMIT");
      const code = (
        await pg.query<{ payment_code: string }>(
          "SELECT payment_code FROM orders WHERE id = 'order-1'",
        )
      ).rows[0].payment_code;
      assert.equal(inserted.paymentCode, code);
      const detailModel = new CustomerOrderModel({
        query: (sql: string, params: unknown[]) => pg.query(sql, params),
      } as DatabaseService);
      const detail = await detailModel.findDetailForUser(
        "order-1",
        "customer-1",
      );
      assert.equal(detail?.payment_code, code);
      const summaries = await detailModel.findSummariesByUser(
        "customer-1",
        2,
        0,
      );
      assert.equal(summaries[0].payment_code, code);
      const client = pg as unknown as PoolClient;
      const db = {
        query: (sql: string, params: unknown[]) => pg.query(sql, params),
        withTransaction: async <T>(
          operation: (transaction: PoolClient) => Promise<T>,
        ) => {
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
      if (confirm) {
        const gateway = new MockPaymentGateway();
        gateway.charge = async () =>
          assert.fail("SePay must not call the mock gateway");
        gateway.lookupByKey = async () =>
          assert.fail("SePay reconciliation must wait for the webhook");
        const payments = new PaymentsService(
          db,
          new PaymentModel(db),
          new OrderModel(),
          gateway,
          new InventoryService(new InventoryModel()),
          new LoyaltyService(new LoyaltyModel()),
        );
        const input = { orderId: "order-1", method: "SEPAY" as const };
        const session = await payments.createPayment(
          "customer-1",
          input,
          "ui-session",
        );
        assert.equal(session.status, "PROCESSING");
        assert.equal(session.method, "SEPAY");
        assert.equal(
          (await payments.createPayment("customer-1", input, "ui-session")).id,
          session.id,
        );
        assert.equal(
          (await payments.reconcilePayment("customer-1", session.id)).status,
          "PROCESSING",
        );
      }
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
      const first = await service.receiveWebhook(
        webhook,
        "Apikey test-webhook-key",
      );
      const replay = await service.receiveWebhook(
        webhook,
        "Apikey test-webhook-key",
      );
      assert.equal(first.orderId, "order-1");
      assert.equal(first.duplicate, false);
      assert.equal(replay.duplicate, true);
      const order = await pg.query<{ status: string }>(
        "SELECT status FROM orders WHERE id = 'order-1'",
      );
      assert.equal(order.rows[0].status, "PAID");
      const payments = await pg.query<{ status: string }>(
        "SELECT status FROM payments WHERE order_id = 'order-1' ORDER BY status",
      );
      assert.deepEqual(
        payments.rows.map((payment) => payment.status),
        confirm ? ["FAILED", "SUCCEEDED"] : ["SUCCEEDED"],
      );
      const earns = await pg.query(
        "SELECT id FROM loyalty_transactions WHERE order_id = 'order-1'",
      );
      assert.equal(earns.rows.length, 1);
    } finally {
      if (previousKey === undefined) delete process.env.SEPAY_WEBHOOK_API_KEY;
      else process.env.SEPAY_WEBHOOK_API_KEY = previousKey;
      await pg.close();
    }
  });
}
