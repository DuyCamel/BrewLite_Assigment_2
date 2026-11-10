import { expect, test } from "@playwright/test";

const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const apiUrl = (process.env.E2E_API_URL ?? "http://localhost:4000").replace(/\/$/, "");
const email = process.env.E2E_USER_EMAIL;
const password = process.env.E2E_USER_PASSWORD;

test("customer checks out a drink and pays it with the mock gateway", async ({ page }) => {
  test.skip(!email || !password, "Set E2E_USER_EMAIL and E2E_USER_PASSWORD to a registered account.");

  await page.goto(baseUrl);
  await page.getByRole("link", { name: "Chọn Matcha latte" }).click();
  await expect(page.getByRole("heading", { name: "Matcha latte" })).toBeVisible();
  await page.getByRole("button", { name: /^Size M/ }).click();
  await page.getByLabel("Kem sữa").check();
  await page.getByRole("button", { name: /Thêm vào giỏ hàng/ }).click();
  await page.getByRole("link", { name: "Xem giỏ hàng" }).click();

  await expect(page.getByRole("heading", { name: "Giỏ hàng" })).toBeVisible();
  await expect(page.locator(".cart-item")).toContainText("Matcha latte");
  await expect(page.locator(".cart-item")).toContainText("Kem sữa");
  await page.reload();
  await expect(page.locator(".cart-item")).toHaveCount(1);
  await page.getByRole("link", { name: /Tiến hành đặt hàng/ }).click();

  await page.getByRole("button", { name: /Đăng nhập để tiếp tục/ }).click();
  await expect(page).toHaveURL(/\/login\?/);
  await page.locator("#login-email").fill(email!);
  await page.locator("#login-password").fill(password!);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL(/\/checkout$/);
  await page.getByRole("button", { name: /Xác nhận đặt hàng/ }).click();
  await expect(page.getByRole("heading", { name: "Đơn của bạn đã sẵn sàng" })).toBeVisible();

  const paymentCode = (await page.locator(".order-number").innerText()).replace(/^.*Mã đơn\s*/s, "").trim();
  await page.getByRole("link", { name: /Tiến hành thanh toán/ }).click();
  await expect(page).toHaveURL(/\/payment\?orderId=/);
  const orderId = new URL(page.url()).searchParams.get("orderId");
  expect(orderId).toBeTruthy();

  // The current payment screen is VietQR-only; exercise the existing mock API from this browser session.
  const paidOrder = await page.evaluate(async ({ apiUrl, orderId }) => {
    const session = JSON.parse(localStorage.getItem("brewlite.session") ?? "null");
    if (!session?.accessToken) throw new Error("Login session is missing");
    const headers = { Authorization: `Bearer ${session.accessToken}` };
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await fetch(`${apiUrl}/payments`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ orderId, method: "WALLET" }),
      });
      if (!response.ok) throw new Error(`Mock payment failed: ${response.status} ${await response.text()}`);
      const payment = await response.json();
      if (payment.status === "PROCESSING") {
        const reconcile = await fetch(`${apiUrl}/payments/${encodeURIComponent(payment.id)}/reconcile`, {
          method: "POST",
          headers,
        });
        if (!reconcile.ok) throw new Error(`Payment reconciliation failed: ${reconcile.status}`);
      }
      const orderResponse = await fetch(`${apiUrl}/orders/${encodeURIComponent(orderId)}`, { headers });
      if (!orderResponse.ok) throw new Error(`Could not load order: ${orderResponse.status}`);
      const order = await orderResponse.json();
      if (order.status === "PAID") return order;
      if (order.status !== "PAYMENT_FAILED" || attempt === 4) break;
      const retry = await fetch(`${apiUrl}/orders/${encodeURIComponent(orderId)}/retry-payment`, {
        method: "POST",
        headers,
      });
      if (!retry.ok) throw new Error(`Could not prepare payment retry: ${retry.status}`);
    }
    throw new Error("Mock gateway did not complete payment successfully after five attempts");
  }, { apiUrl, orderId: orderId! });
  expect(paidOrder.status).toBe("PAID");

  await page.goto(`${baseUrl}/payment-status?orderId=${encodeURIComponent(orderId!)}`);
  await expect(page.getByRole("heading", { name: "Thanh toán thành công" })).toBeVisible({ timeout: 70_000 });
  await expect(page.getByRole("status")).toContainText(paymentCode);
  await page.waitForFunction(() => localStorage.getItem("cart") === "[]");

  await page.goto(`${baseUrl}/cart`);
  await expect(page.getByRole("heading", { name: "Giỏ hàng đang trống" })).toBeVisible();
});
