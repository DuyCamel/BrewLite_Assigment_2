import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import {
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { LoyaltyModel } from "../src/models/loyalty.model.js";
import type { PaymentAttemptRecord } from "../src/models/payment.model.js";
import { LoyaltyService } from "../src/services/loyalty.service.js";
import { PaymentsService } from "../src/services/payments.service.js";
import type { PaymentInput, PoolClient } from "../src/types/contracts.js";

const paymentInput: PaymentInput = {
  orderId: "order-1",
  method: "WALLET",
};
const payloadHash = createHash("sha256")
  .update(JSON.stringify(paymentInput))
  .digest("hex");

function createProcessingPayment(userId = "user-1") {
  let payment: PaymentAttemptRecord = {
    id: "payment-1",
    order_id: paymentInput.orderId,
    user_id: userId,
    idempotency_key: "key-1",
    payload_hash: payloadHash,
    amount: 12_000,
    method: paymentInput.method,
    status: "PROCESSING",
  };
  let orderStatus = "PENDING";
  const earned: Array<{ userId: string; orderId: string; amount: number }> = [];
  const charged: string[] = [];

  const service = new PaymentsService(
    {
      withTransaction: async (operation: (client: PoolClient) => Promise<unknown>) =>
        operation({} as PoolClient),
    } as never,
    {
      findByKey: async () => payment,
      findById: async () => payment,
      updateResult: async (_id: string, result: "SUCCEEDED" | "FAILED") => {
        payment = { ...payment, status: result };
        return true;
      },
    } as never,
    {
      findForUpdate: async () => ({
        id: paymentInput.orderId,
        userId,
        status: orderStatus,
        total: payment.amount,
      }),
      updateStatus: async (_id: string, _from: string, to: string) => {
        orderStatus = to;
        return true;
      },
    } as never,
    {
      charge: async (
        orderId: string,
        amount: number,
        method: PaymentInput["method"],
        key: string,
      ) => {
        charged.push(`${orderId}:${amount}:${method}:${key}`);
        return "SUCCESS" as const;
      },
      lookupByKey: async () => "NOT_FOUND" as const,
    } as never,
    {} as never,
    {
      earnPoints: async (
        earnedUserId: string,
        orderId: string,
        amount: number,
      ) => {
        earned.push({ userId: earnedUserId, orderId, amount });
      },
    } as never,
  );
  return { service, charged, earned, get payment() { return payment; } };
}

function createNewPaymentFlow() {
  let payment: PaymentAttemptRecord | null = null;
  let orderStatus = "PENDING";
  let lock: Promise<void> = Promise.resolve();
  let releaseStockCalls = 0;
  let earnCalls = 0;
  let insertCalls = 0;
  let gatewayEffects = 0;
  const gatewayResults = new Map<string, "SUCCESS" | "FAILED" | "TIMEOUT">();
  const gatewayInFlight = new Map<string, Promise<"SUCCESS" | "FAILED" | "TIMEOUT">>();

  const service = new PaymentsService(
    {
      withTransaction: async <T>(operation: (client: PoolClient) => Promise<T>) => {
        const previous = lock;
        let unlock!: () => void;
        lock = new Promise<void>((resolve) => {
          unlock = resolve;
        });
        await previous;
        try {
          return await operation({} as PoolClient);
        } finally {
          unlock();
        }
      },
    } as never,
    {
      findByKey: async (key: string) =>
        payment?.idempotency_key === key ? payment : null,
      insertAttempt: async (
        input: PaymentInput,
        amount: number,
        key: string,
        hash: string,
      ) => {
        insertCalls += 1;
        payment = {
          id: "payment-new",
          order_id: input.orderId,
          user_id: "user-1",
          idempotency_key: key,
          payload_hash: hash,
          amount,
          method: input.method,
          status: "PROCESSING",
        };
        return payment.id;
      },
      findById: async () => payment,
      updateResult: async (_id: string, result: "SUCCEEDED" | "FAILED") => {
        if (!payment || payment.status !== "PROCESSING") return false;
        payment = { ...payment, status: result };
        return true;
      },
    } as never,
    {
      findForUpdate: async () => ({
        id: paymentInput.orderId,
        userId: "user-1",
        status: orderStatus,
        total: 12_000,
      }),
      hasProcessingPayment: async () => payment?.status === "PROCESSING",
      updateStatus: async (_id: string, _from: string, to: string) => {
        orderStatus = to;
        return true;
      },
    } as never,
    {
      charge: async (
        _orderId: string,
        _amount: number,
        _method: PaymentInput["method"],
        key: string,
      ) => {
        const completed = gatewayResults.get(key);
        if (completed) return completed;
        const active = gatewayInFlight.get(key);
        if (active) return active;
        const operation = new Promise<"SUCCESS" | "FAILED" | "TIMEOUT">(
          (resolve) => {
            gatewayEffects += 1;
            setTimeout(() => {
              const result = "SUCCESS";
              gatewayResults.set(key, result);
              resolve(result);
            }, 1);
          },
        );
        gatewayInFlight.set(key, operation);
        try {
          return await operation;
        } finally {
          gatewayInFlight.delete(key);
        }
      },
      lookupByKey: async (key: string) => gatewayResults.get(key) ?? "NOT_FOUND",
    } as never,
    {
      releaseStock: async () => {
        releaseStockCalls += 1;
        return true;
      },
    } as never,
    {
      earnPoints: async () => {
        earnCalls += 1;
      },
    } as never,
  );
  return {
    service,
    gatewayResults,
    setOrderStatus(status: string) {
      orderStatus = status;
    },
    get state() {
      return {
        payment,
        orderStatus,
        releaseStockCalls,
        earnCalls,
        insertCalls,
        gatewayEffects,
      };
    },
  };
}

test("retry cùng idempotency key hoàn tất payment PROCESSING mà không tạo attempt mới", async () => {
  const fixture = createProcessingPayment();

  const result = await fixture.service.createPayment(
    "user-1",
    paymentInput,
    "key-1",
  );

  assert.equal(result.status, "SUCCEEDED");
  assert.deepEqual(fixture.charged, ["order-1:12000:WALLET:key-1"]);
  assert.deepEqual(fixture.earned, [
    { userId: "user-1", orderId: "order-1", amount: 12_000 },
  ]);
});

test("không cho phép dùng idempotency key của người dùng khác", async () => {
  const fixture = createProcessingPayment("another-user");

  await assert.rejects(
    fixture.service.createPayment("user-1", paymentInput, "key-1"),
    NotFoundException,
  );
  assert.deepEqual(fixture.charged, []);
});

test("LoyaltyModel tạo id cho EARN và LoyaltyService vẫn ghi giao dịch 0 điểm", async () => {
  let parameters: unknown[] = [];
  const transaction = {
    query: async (_sql: string, values: unknown[]) => {
      parameters = values;
      return { rowCount: 1, rows: [] };
    },
  } as unknown as PoolClient;
  const model = new LoyaltyModel();

  await model.insertEarnOnce("user-1", "order-1", 0, transaction);
  assert.match(String(parameters[0]), /^[0-9a-f-]{36}$/i);
  assert.deepEqual(parameters.slice(1), ["user-1", "order-1", 0]);

  let recordedPoints: number | undefined;
  const service = new LoyaltyService({
    insertEarnOnce: async (_userId, _orderId, points) => {
      recordedPoints = points;
    },
  } as never);
  await service.earnPoints("user-1", "order-1", 9_999, transaction);
  assert.equal(recordedPoints, 0);
});

test("hai request đồng thời cùng key chỉ tạo một attempt và một lần charge", async () => {
  const fixture = createNewPaymentFlow();
  const results = await Promise.all([
    fixture.service.createPayment("user-1", paymentInput, "same-key"),
    fixture.service.createPayment("user-1", paymentInput, "same-key"),
  ]);

  assert.equal(fixture.state.insertCalls, 1);
  assert.equal(fixture.state.gatewayEffects, 1);
  assert.equal(results[0].id, results[1].id);
  assert.equal(fixture.state.orderStatus, "PAID");
  assert.equal(fixture.state.earnCalls, 1);
});

test("hai key khác nhau đồng thời không tạo hai payment live cho một đơn", async () => {
  const fixture = createNewPaymentFlow();
  const results = await Promise.allSettled([
    fixture.service.createPayment("user-1", paymentInput, "key-a"),
    fixture.service.createPayment("user-1", paymentInput, "key-b"),
  ]);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const rejected = results.find((result) => result.status === "rejected");
  assert.ok(rejected && rejected.status === "rejected");
  assert.ok(rejected.reason instanceof ConflictException);
  assert.equal(fixture.state.insertCalls, 1);
  assert.equal(fixture.state.gatewayEffects, 1);
  assert.equal(fixture.state.earnCalls, 1);
});

test("chỉ cho retry bằng key mới sau FAILED xác định", async () => {
  const fixture = createNewPaymentFlow();
  fixture.gatewayResults.set("first-key", "FAILED");

  const failed = await fixture.service.createPayment(
    "user-1",
    paymentInput,
    "first-key",
  );
  assert.equal(failed.status, "FAILED");
  assert.equal(fixture.state.orderStatus, "PAYMENT_FAILED");
  assert.equal(fixture.state.releaseStockCalls, 1);

  fixture.setOrderStatus("PENDING");
  const retried = await fixture.service.createPayment(
    "user-1",
    paymentInput,
    "retry-key",
  );

  assert.equal(retried.status, "SUCCEEDED");
  assert.equal(fixture.state.insertCalls, 2);
  assert.equal(fixture.state.orderStatus, "PAID");
  assert.equal(fixture.state.releaseStockCalls, 1);
  assert.equal(fixture.state.earnCalls, 1);
});

test("dùng lại key cho payload khác trả 409 mà không gọi gateway", async () => {
  const fixture = createProcessingPayment();

  await assert.rejects(
    fixture.service.createPayment(
      "user-1",
      { ...paymentInput, method: "CARD" },
      "key-1",
    ),
    ConflictException,
  );
  assert.deepEqual(fixture.charged, []);
});

test("đối soát chỉ chốt kết quả cuối; kết quả chưa rõ tiếp tục giữ PROCESSING", async () => {
  const fixture = createProcessingPayment();
  const payment = fixture.payment;

  const pending = await fixture.service.reconcilePayment("user-1", payment.id);
  assert.equal(pending.status, "PROCESSING");
  assert.deepEqual(fixture.earned, []);

  const fixtureWithGatewayResult = createNewPaymentFlow();
  fixtureWithGatewayResult.gatewayResults.set("reconcile-key", "TIMEOUT");
  const processing = await fixtureWithGatewayResult.service.createPayment(
    "user-1",
    paymentInput,
    "reconcile-key",
  );
  assert.equal(processing.status, "PROCESSING");
  fixtureWithGatewayResult.gatewayResults.set("reconcile-key", "SUCCESS");
  const reconciled = await fixtureWithGatewayResult.service.reconcilePayment(
    "user-1",
    processing.id,
  );
  assert.equal(reconciled.status, "SUCCEEDED");
  assert.equal(fixtureWithGatewayResult.state.earnCalls, 1);
});
