import assert from "node:assert/strict";
import { test } from "node:test";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module.js";

test("SePay HTTP phân biệt lỗi xác thực, thiếu cấu hình và payload sai", async () => {
  const previousSource = process.env.PRODUCT_DATA_SOURCE;
  const previousKey = process.env.SEPAY_WEBHOOK_API_KEY;
  process.env.PRODUCT_DATA_SOURCE = "sample";
  const app = await NestFactory.create(AppModule, { logger: false });
  try {
    await app.listen(0, "127.0.0.1");
    for (const [key, header, status, message] of [
      [undefined, undefined, 401, "Webhook SePay chưa được xác thực"],
      [undefined, "Apikey test-key", 503, "Máy chủ chưa cấu hình webhook SePay. Liên hệ người quản trị."],
      ["test-key", "Apikey wrong-key", 401, "Webhook SePay không hợp lệ"],
      ["test-key", "Apikey test-key", 400, "Payload SePay thiếu dữ liệu giao dịch"],
    ] as const) {
      if (key === undefined) delete process.env.SEPAY_WEBHOOK_API_KEY;
      else process.env.SEPAY_WEBHOOK_API_KEY = key;
      const response = await fetch(`${await app.getUrl()}/webhooks/sepay`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(header ? { authorization: header } : {}) },
        body: JSON.stringify({}),
      });
      assert.equal(response.status, status);
      const body = await response.json();
      assert.equal(body.statusCode, status);
      assert.equal(body.message, message);
    }
  } finally {
    await app.close();
    if (previousSource === undefined) delete process.env.PRODUCT_DATA_SOURCE;
    else process.env.PRODUCT_DATA_SOURCE = previousSource;
    if (previousKey === undefined) delete process.env.SEPAY_WEBHOOK_API_KEY;
    else process.env.SEPAY_WEBHOOK_API_KEY = previousKey;
  }
});
