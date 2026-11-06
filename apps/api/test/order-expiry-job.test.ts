// Test OrderExpiryJob: không chạy chồng, lỗi không làm kẹt cờ, huỷ timer không lỗi.
import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { OrderExpiryJob } from "../src/services/OrderExpiryJob.js";
import type { OrdersService } from "../src/services/orders.service.js";

type Internals = { run(): Promise<void>; timer: NodeJS.Timeout | null };

function makeJob(expirePendingOrders: () => Promise<number>) {
  const job = new OrderExpiryJob({
    expirePendingOrders,
  } as unknown as OrdersService);
  return { job, internals: job as unknown as Internals };
}

test("job không chạy chồng khi lần trước chưa xong", async () => {
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const { internals } = makeJob(async () => {
    calls++;
    await gate;
    return 0;
  });

  const first = internals.run();
  const second = internals.run(); // lần 1 đang chạy nên phải bỏ qua ngay
  await second;
  assert.equal(calls, 1);

  release();
  await first;
  await internals.run(); // lần 1 đã xong nên được chạy lại
  assert.equal(calls, 2);
});

test("job gặp lỗi thì không ném ra ngoài và không bị kẹt cờ running", async () => {
  const errorLog = mock.method(console, "error", () => {});
  let calls = 0;
  const { internals } = makeJob(async () => {
    calls++;
    if (calls === 1) {
      throw new Error("DB lỗi giả");
    }
    return 0;
  });

  await internals.run(); // lỗi bị bắt, không ném
  await internals.run(); // cờ đã được reset nên vẫn chạy được
  assert.equal(calls, 2);
  assert.equal(errorLog.mock.callCount(), 1);
  errorLog.mock.restore();
});

test("onModuleDestroy không lỗi khi chưa có hoặc đã có timer", () => {
  const { job, internals } = makeJob(async () => 0);
  assert.doesNotThrow(() => job.onModuleDestroy());

  internals.timer = setInterval(() => {}, 1_000_000);
  assert.doesNotThrow(() => job.onModuleDestroy());
});
