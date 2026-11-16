import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import type { PoolClient } from "pg";
import type { DatabaseService } from "../src/config/db.js";
import { OrderModel } from "../src/models/order.model.js";
import { InventoryModel } from "../src/models/inventory.model.js";
import { InventoryService } from "../src/services/inventory.service.js";
import { OrdersService } from "../src/services/orders.service.js";
import { PromotionsService } from "../src/services/promotions.service.js";
import { SepayModel } from "../src/sepay/sepay.model.js";
import { SepayService } from "../src/sepay/sepay.services.js";
import {
  ConfigurationError,
  paymentLifetimes,
} from "../src/config/environment.js";
import {
  createTestDb,
  makeFakeDatabase,
  PRODUCT_ID,
  readOrder,
  readStock,
  UNIT_S,
  USER_ID,
} from "./tv4-helpers.js";

test("expired first QR finalizes SePay without cancelling or releasing stock, then allows reissue", async () => {
  const pg = await createTestDb();
  try {
    await pg.exec(readFileSync(new URL("../database/011_sepay_payment_method.sql", import.meta.url), "utf8"));
    const orders = new OrdersService(
      makeFakeDatabase(pg),
      new OrderModel(),
      new InventoryService(new InventoryModel()),
      new PromotionsService({ findByCode: async () => null } as never),
    );
    await orders.expirePendingOrders();
    const created = await orders.createOrder(USER_ID, {
      items: [{ productId: PRODUCT_ID, size: "S", toppingIds: [], quantity: 1 }],
    });
    await pg.query(
      `INSERT INTO payments (id, order_id, idempotency_key, payload_hash, amount, method)
       VALUES ('first-sepay', $1, 'first-sepay', repeat('c', 64), $2, 'SEPAY')`,
      [created.orderId, UNIT_S],
    );
    await pg.query("UPDATE orders SET qr_expires_at = now() - interval '1 second' WHERE id = $1", [created.orderId]);
    assert.equal(await orders.expirePendingOrders(), 0);
    const payment = (await pg.query<{ status: string; resolved_at: Date }>(
      "SELECT status, resolved_at FROM payments WHERE id = 'first-sepay'",
    )).rows[0];
    assert.equal(payment.status, "FAILED");
    assert.ok(payment.resolved_at);
    assert.equal((await readOrder(pg, created.orderId)).status, "PENDING");
    assert.equal((await readOrder(pg, created.orderId)).stock_released, false);
    assert.equal(await readStock(pg), 9);
    assert.equal(await orders.expirePendingOrders(), 0);
    assert.deepEqual((await pg.query("SELECT status, resolved_at FROM payments WHERE id = 'first-sepay'")).rows[0], payment);
    const renewed = await orders.reissueQr(USER_ID, created.orderId);
    assert.equal(renewed.qrAttempts, 2);
    assert.notEqual(renewed.paymentCode, created.paymentCode);
    assert.equal(await readStock(pg), 9);
  } finally {
    await pg.close();
  }
});

test("order lifetime must be at least twice QR lifetime", () => {
  const previousOrder = process.env.ORDER_TTL_MINUTES;
  const previousQr = process.env.QR_TTL_MINUTES;
  try {
    process.env.QR_TTL_MINUTES = "5";
    process.env.ORDER_TTL_MINUTES = "9";
    assert.throws(() => paymentLifetimes(), ConfigurationError);
    process.env.ORDER_TTL_MINUTES = "10";
    assert.deepEqual(paymentLifetimes(), { orderMinutes: 10, qrMinutes: 5 });
    process.env.ORDER_TTL_MINUTES = "2";
    process.env.QR_TTL_MINUTES = "1";
    assert.deepEqual(paymentLifetimes(), { orderMinutes: 2, qrMinutes: 1 });
    process.env.ORDER_TTL_MINUTES = "1";
    process.env.QR_TTL_MINUTES = "0.5";
    assert.deepEqual(paymentLifetimes(), { orderMinutes: 1, qrMinutes: 0.5 });
    process.env.QR_TTL_MINUTES = "0.49";
    assert.throws(() => paymentLifetimes(), ConfigurationError);
  } finally {
    if (previousOrder === undefined) delete process.env.ORDER_TTL_MINUTES;
    else process.env.ORDER_TTL_MINUTES = previousOrder;
    if (previousQr === undefined) delete process.env.QR_TTL_MINUTES;
    else process.env.QR_TTL_MINUTES = previousQr;
  }
});

for (const scenario of [
  { method: "SEPAY", expiry: "first", action: "reissue" },
  { method: "SEPAY", expiry: "first", action: "cancel" },
  { method: "SEPAY", expiry: "live", action: "cancel" },
  { method: "SEPAY", expiry: "order", action: "cleanup" },
  { method: "SEPAY", expiry: "second", action: "cleanup" },
  ...["CARD", "WALLET"].flatMap((method) =>
    ["first", "order", "second"].map((expiry) => ({ method, expiry, action: "protected" })),
  ),
]) {
  test(`${scenario.method} ${scenario.expiry} expiry: ${scenario.action} preserves payment and stock safety`, async () => {
    const pg = await createTestDb();
    try {
      await pg.exec(readFileSync(new URL("../database/011_sepay_payment_method.sql", import.meta.url), "utf8"));
      const orders = new OrdersService(
        makeFakeDatabase(pg),
        new OrderModel(),
        new InventoryService(new InventoryModel()),
        new PromotionsService({ findByCode: async () => null } as never),
      );
      await orders.expirePendingOrders();
      const created = await orders.createOrder(USER_ID, {
        items: [{ productId: PRODUCT_ID, size: "S", toppingIds: [], quantity: 1 }],
      });
      await pg.query(
        `INSERT INTO payments (id, order_id, idempotency_key, payload_hash, amount, method)
         VALUES ('session', $1, 'session', repeat('c', 64), $2, $3)`,
        [created.orderId, UNIT_S, scenario.method],
      );
      if (scenario.expiry !== "live") {
        await pg.query(
          "UPDATE orders SET qr_expires_at = now() - interval '1 second' WHERE id = $1",
          [created.orderId],
        );
      }
      if (scenario.expiry === "order") {
        await pg.query(
          "UPDATE orders SET expires_at = created_at + interval '1 millisecond', qr_expires_at = now() + interval '5 minutes' WHERE id = $1",
          [created.orderId],
        );
      }
      if (scenario.expiry === "second") {
        await pg.query("UPDATE orders SET qr_attempts = 2 WHERE id = $1", [created.orderId]);
      }
      const deadline = (await pg.query("SELECT expires_at FROM orders WHERE id = $1", [created.orderId])).rows[0];
      const protectedPayment = scenario.action === "protected" || scenario.expiry === "live";
      if (protectedPayment) {
        assert.equal(await orders.expirePendingOrders(), 0);
        await assert.rejects(() => orders.reissueQr(USER_ID, created.orderId), ConflictException);
        await assert.rejects(() => orders.cancelOrder(USER_ID, created.orderId), ConflictException);
      } else if (scenario.action === "reissue") {
        await assert.rejects(() => orders.reissueQr("other-user", created.orderId), NotFoundException);
        assert.equal((await pg.query("SELECT status FROM payments WHERE id = 'session'")).rows[0].status, "PROCESSING");
        assert.equal((await orders.reissueQr(USER_ID, created.orderId)).qrAttempts, 2);
        await assert.rejects(() => orders.reissueQr(USER_ID, created.orderId), ConflictException);
      } else if (scenario.action === "cancel") {
        assert.equal((await orders.cancelOrder(USER_ID, created.orderId)).status, "CANCELLED");
        await assert.rejects(() => orders.cancelOrder(USER_ID, created.orderId), ConflictException);
      } else {
        assert.equal(await orders.expirePendingOrders(), 1);
        assert.equal(await orders.expirePendingOrders(), 0);
      }
      const cancelled = !protectedPayment && scenario.action !== "reissue";
      const order = await readOrder(pg, created.orderId);
      assert.equal(order.status, cancelled ? "CANCELLED" : "PENDING");
      assert.equal(order.stock_released, cancelled);
      assert.equal(await readStock(pg), cancelled ? 10 : 9);
      const payment = (await pg.query<{ status: string; resolved_at: Date | null }>(
        "SELECT status, resolved_at FROM payments WHERE id = 'session'",
      )).rows[0];
      assert.equal(payment.status, protectedPayment ? "PROCESSING" : "FAILED");
      assert.equal(payment.resolved_at === null, protectedPayment);
      assert.deepEqual((await pg.query("SELECT expires_at FROM orders WHERE id = $1", [created.orderId])).rows[0], deadline);
    } finally {
      await pg.close();
    }
  });
}

test("QR chi duoc cap lai mot lan; ma cu bi tu choi, het luot hai thi huy va hoan ton", async () => {
  const pg = new PGlite();
  const previousKey = process.env.SEPAY_WEBHOOK_API_KEY;
  const previousOrder = process.env.ORDER_TTL_MINUTES;
  const previousQr = process.env.QR_TTL_MINUTES;
  process.env.SEPAY_WEBHOOK_API_KEY = "test-webhook-key";
  process.env.ORDER_TTL_MINUTES = "1";
  process.env.QR_TTL_MINUTES = "0.5";
  try {
    for (const name of [
      "001_schema.sql",
      "007_order_payment_codes.sql",
      "009_qr_reissue.sql",
      "011_sepay_payment_method.sql",
    ]) {
      await pg.exec(
        readFileSync(new URL(`../database/${name}`, import.meta.url), "utf8"),
      );
    }
    await pg.exec(`INSERT INTO users (id, email, password_hash, display_name)
      VALUES ('customer-1', 'test@example.com', '$2b$10$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'Customer');
      INSERT INTO products (id, name, category, price, sizes)
      VALUES ('drink-1', 'Drink', 'Drinks', 80000, '[{"name":"S","extraPrice":0}]');
      INSERT INTO ingredients (id, name, unit, stock) VALUES ('ingredient-1', 'Drink', 'piece', 10);
      INSERT INTO product_recipes (product_id, size, ingredient_id, quantity)
      VALUES ('drink-1', 'S', 'ingredient-1', 1);`);
    const db = {
      withTransaction: async <T>(
        operation: (client: PoolClient) => Promise<T>,
      ): Promise<T> => {
        await pg.exec("BEGIN");
        try {
          const result = await operation(pg as unknown as PoolClient);
          await pg.exec("COMMIT");
          return result;
        } catch (error) {
          await pg.exec("ROLLBACK");
          throw error;
        }
      },
    } as DatabaseService;
    const inventory = new InventoryService(new InventoryModel());
    const orders = new OrdersService(
      db,
      new OrderModel(),
      inventory,
      new PromotionsService({
        findByCode: async () => null,
      } as never),
    );
    const created = await orders.createOrder("customer-1", {
      items: [{ productId: "drink-1", size: "S", toppingIds: [], quantity: 1 }],
    });
    assert.equal(
      (
        await pg.query<{ stock: number }>(
          "SELECT stock FROM ingredients WHERE id = 'ingredient-1'",
        )
      ).rows[0].stock,
      9,
    );
    const before = (
      await pg.query<{
        payment_code: string;
        qr_attempts: number;
        created_at: string;
        expires_at: string;
        qr_expires_at: string;
      }>(
        "SELECT payment_code, qr_attempts, created_at, expires_at, qr_expires_at FROM orders WHERE id = $1",
        [created.orderId],
      )
    ).rows[0];
    assert.equal(before.qr_attempts, 1);
    assert.equal(new Date(before.expires_at).getTime() - new Date(before.created_at).getTime(), 60_000);
    assert.equal(new Date(before.qr_expires_at).getTime() - new Date(before.created_at).getTime(), 30_000);
    assert.ok(
      new Date(before.expires_at).getTime() >
        new Date(before.qr_expires_at).getTime(),
    );
    await pg.query(
      "UPDATE orders SET qr_expires_at = now() - interval '1 second' WHERE id = $1",
      [created.orderId],
    );
    assert.equal(await orders.expirePendingOrders(), 0);
    await assert.rejects(
      () => orders.reissueQr("other-user", created.orderId),
      NotFoundException,
    );
    const renewed = await orders.reissueQr("customer-1", created.orderId);
    assert.notEqual(renewed.paymentCode, before.payment_code);
    assert.equal(renewed.qrAttempts, 2);
    assert.ok(
      new Date(renewed.qrExpiresAt).getTime() <=
        new Date(before.expires_at).getTime(),
    );
    await assert.rejects(
      () => orders.reissueQr("customer-1", created.orderId),
      ConflictException,
    );

    const sepay = new SepayService(db, new SepayModel());
    const webhook = (content: string) => ({
      id: 12345,
      content,
      transferType: "in",
      transferAmount: 80000,
    });
    await assert.rejects(
      () =>
        sepay.receiveWebhook(
          webhook(before.payment_code),
          "Apikey test-webhook-key",
        ),
      BadRequestException,
    );
    await assert.rejects(
      () =>
        sepay.receiveWebhook(
          webhook(created.orderId),
          "Apikey test-webhook-key",
        ),
      ConflictException,
    );
    await pg.query(
      "UPDATE orders SET qr_expires_at = now() - interval '1 second' WHERE id = $1",
      [created.orderId],
    );
    assert.equal(await orders.expirePendingOrders(), 1);
    assert.equal(await orders.expirePendingOrders(), 0);
    const final = (
      await pg.query<{ status: string; stock_released: boolean }>(
        "SELECT status, stock_released FROM orders WHERE id = $1",
        [created.orderId],
      )
    ).rows[0];
    assert.equal(final.status, "CANCELLED");
    assert.equal(final.stock_released, true);
    assert.equal(
      (
        await pg.query<{ stock: number }>(
          "SELECT stock FROM ingredients WHERE id = 'ingredient-1'",
        )
      ).rows[0].stock,
      10,
    );

    const second = await orders.createOrder("customer-1", {
      items: [{ productId: "drink-1", size: "S", toppingIds: [], quantity: 1 }],
    });
    await pg.query(
      "UPDATE orders SET qr_expires_at = now() - interval '1 second' WHERE id = $1",
      [second.orderId],
    );
    const active = await orders.reissueQr("customer-1", second.orderId);
    const result = await sepay.receiveWebhook(
      {
        id: 12346,
        content: active.paymentCode,
        transferType: "in",
        transferAmount: 80000,
      },
      "Apikey test-webhook-key",
    );
    assert.equal(result.status, "PAID");
    assert.equal(await orders.expirePendingOrders(), 0);

    const third = await orders.createOrder("customer-1", {
      items: [{ productId: "drink-1", size: "S", toppingIds: [], quantity: 1 }],
    });
    const previousCode = third.paymentCode;
    await db.withTransaction(async (client) => {
      await client.query(
        `INSERT INTO payments (id, order_id, idempotency_key, payload_hash, amount, method, status, resolved_at)
        VALUES ('failed-third', $1, 'failed-third-key', repeat('c', 64), 80000, 'CARD', 'PROCESSING', null)`,
        [third.orderId],
      );
      await client.query(
        "UPDATE payments SET status = 'FAILED', resolved_at = now() WHERE id = 'failed-third'",
      );
      await client.query(
        "UPDATE orders SET status = 'PAYMENT_FAILED' WHERE id = $1",
        [third.orderId],
      );
      await inventory.releaseStock(third.orderId, client);
    });
    await orders.preparePaymentRetry("customer-1", third.orderId);
    const freshCode = (
      await pg.query<{ payment_code: string }>(
        "SELECT payment_code FROM orders WHERE id = $1",
        [third.orderId],
      )
    ).rows[0].payment_code;
    assert.notEqual(freshCode, previousCode);
    await assert.rejects(
      () =>
        sepay.receiveWebhook(
          {
            id: 12347,
            content: previousCode,
            transferType: "in",
            transferAmount: 80000,
          },
          "Apikey test-webhook-key",
        ),
      BadRequestException,
    );
    const paidRetry = await sepay.receiveWebhook(
      {
        id: 12348,
        content: freshCode,
        transferType: "in",
        transferAmount: 80000,
      },
      "Apikey test-webhook-key",
    );
    assert.equal(paidRetry.status, "PAID");

    const fourth = await orders.createOrder("customer-1", {
      items: [{ productId: "drink-1", size: "S", toppingIds: [], quantity: 1 }],
    });
    await pg.query(
      `UPDATE orders SET expires_at = created_at + interval '1 millisecond'
      WHERE id = $1`,
      [fourth.orderId],
    );
    assert.equal(await orders.expirePendingOrders(), 1);
    assert.equal(
      (
        await pg.query<{ status: string; stock_released: boolean }>(
          "SELECT status, stock_released FROM orders WHERE id = $1",
          [fourth.orderId],
        )
      ).rows[0].status,
      "CANCELLED",
    );
  } finally {
    if (previousKey === undefined) delete process.env.SEPAY_WEBHOOK_API_KEY;
    else process.env.SEPAY_WEBHOOK_API_KEY = previousKey;
    if (previousOrder === undefined) delete process.env.ORDER_TTL_MINUTES;
    else process.env.ORDER_TTL_MINUTES = previousOrder;
    if (previousQr === undefined) delete process.env.QR_TTL_MINUTES;
    else process.env.QR_TTL_MINUTES = previousQr;
    await pg.close();
  }
});

test("migration backfills the previous QR deadline without changing existing order expiry", async () => {
  const pg = new PGlite();
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
    await pg.exec(`INSERT INTO users (id, email, password_hash, display_name)
      VALUES ('legacy-user', 'legacy@example.com', '$2b$10$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'Legacy');
      INSERT INTO products (id, name, category, price, sizes)
      VALUES ('legacy-drink', 'Drink', 'Drinks', 100, '[{"name":"S","extraPrice":0}]');
      BEGIN;
      INSERT INTO orders (id, user_id, subtotal, total, expires_at)
      VALUES ('legacy-order', 'legacy-user', 100, 100, now() + interval '2 minutes');
      INSERT INTO order_items (id, order_id, product_id, product_name, size, quantity, unit_price, line_total)
      VALUES ('legacy-item', 'legacy-order', 'legacy-drink', 'Drink', 'S', 1, 100, 100);
      COMMIT;`);
    await pg.exec(
      readFileSync(
        new URL("../database/009_qr_reissue.sql", import.meta.url),
        "utf8",
      ),
    );
    const legacy = (
      await pg.query<{
        qr_attempts: number;
        qr_expires_at: string;
        expires_at: string;
      }>(
        "SELECT qr_attempts, qr_expires_at, expires_at FROM orders WHERE id = 'legacy-order'",
      )
    ).rows[0];
    assert.equal(legacy.qr_attempts, 1);
    assert.equal(
      new Date(legacy.qr_expires_at).getTime(),
      new Date(legacy.expires_at).getTime(),
    );
  } finally {
    await pg.close();
  }
});
