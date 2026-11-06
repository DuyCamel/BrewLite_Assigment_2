import assert from "node:assert/strict";
import { test } from "node:test";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module.js";

test("SePay webhook rejects unauthenticated HTTP requests instead of crashing", async () => {
  process.env.PRODUCT_DATA_SOURCE = "sample";
  const app = await NestFactory.create(AppModule, { logger: false });
  try {
    await app.listen(0, "127.0.0.1");
    const response = await fetch(`${await app.getUrl()}/webhooks/sepay`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(response.status, 401);
  } finally {
    await app.close();
  }
});
