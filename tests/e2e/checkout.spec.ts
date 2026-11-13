import { randomUUID } from "node:crypto";
import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
  type Page,
  type Response,
} from "@playwright/test";

// Combined Anh/MinhTri coverage. Run only against the disposable E2E stack.
const API = "http://localhost:4400";
const SEPAY_KEY = "brewlite-e2e-webhook-test-only";
const PASSWORD = "BrewLite123!";
const ITEM = {
  productId: "ca-phe-sua",
  size: "M",
  toppingIds: ["cream"],
  quantity: 1,
};
const TOTAL = 50_000; // Seed: coffee 35,000 + M 5,000 + cream 10,000.

type Order = {
  id: string;
  paymentCode: string;
  status: string;
  subtotal: number;
  discount: number;
  total: number;
  pointsEarned: number | null;
  items: Array<typeof ITEM & { unitPrice: number; lineTotal: number }>;
  payments: Array<{
    id: string;
    status: string;
    amount: number;
    method: string;
  }>;
};
type Payment = { id: string; status: "PROCESSING" | "SUCCEEDED" | "FAILED" };

async function json<T>(response: APIResponse | Response): Promise<T> {
  expect(
    response.ok(),
    `${response.url()}: ${response.status()} ${await response.text()}`,
  ).toBeTruthy();
  return response.json();
}

async function register(request: APIRequestContext) {
  const email = `e2e-${randomUUID()}@brewlite.test`;
  await json(
    await request.post(`${API}/auth/register`, {
      data: { email, password: PASSWORD },
    }),
  );
  const session = await json<{ accessToken: string }>(
    await request.post(`${API}/auth/login`, {
      data: { email, password: PASSWORD },
    }),
  );
  expect(session.accessToken).toBeTruthy();
  return { email, headers: { Authorization: `Bearer ${session.accessToken}` } };
}

type User = Awaited<ReturnType<typeof register>>;

async function orderDetail(request: APIRequestContext, user: User, id: string) {
  return json<Order>(
    await request.get(`${API}/orders/${id}`, { headers: user.headers }),
  );
}

async function createOrder(request: APIRequestContext, user: User) {
  const created = await json<{ orderId: string }>(
    await request.post(`${API}/orders`, {
      headers: user.headers,
      data: { items: [ITEM] },
    }),
  );
  return orderDetail(request, user, created.orderId);
}

async function login(page: Page, email: string) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

async function addToCart(page: Page) {
  await page.goto("/");
  await page.locator(`a[href="/products/${ITEM.productId}"]`).first().click();
  await page.getByRole("button", { name: /^Size M/ }).click();
  await page.getByRole("checkbox", { name: /Kem sữa/ }).check();
  await page.getByRole("button", { name: /Thêm vào giỏ hàng/ }).click();
  // This link appears only after stock validation and localStorage persistence.
  await page.getByRole("link", { name: "Xem giỏ hàng", exact: true }).click();
  await expect(page.locator(".cart-item")).toHaveCount(1);
  await expect(page.locator(".cart-item")).toContainText("Cà phê sữa");
  await expect(page.locator(".cart-item")).toContainText("Kem sữa");
  await expect(page.locator(".cart-item")).toContainText("M");
  await expect(page.locator(".summary-total")).toContainText("50.000");
}

async function cart(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("cart") ?? "[]"));
}

function transfer(order: Order) {
  const id = Date.now() * 1000 + Math.floor(Math.random() * 1000);
  return {
    id,
    gateway: "E2E",
    content: order.paymentCode,
    transferType: "in",
    transferAmount: order.total,
    referenceCode: `E2E-${id}`,
  };
}

async function webhook(
  request: APIRequestContext,
  payload: ReturnType<typeof transfer>,
) {
  return request.post(`${API}/webhooks/sepay`, {
    headers: { Authorization: `Apikey ${SEPAY_KEY}` },
    data: payload,
  });
}

test.beforeEach(async ({ page, request }) => {
  await json(await request.get(`${API}/health`));
  // Only the third-party image is stubbed; QR parameters and all app APIs stay real.
  await page.route("https://vietqr.app/img?**", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="black"/></svg>',
    }),
  );
});

test("UI checkout preserves the cart, displays the correct QR and pays exactly once", async ({
  page,
  request,
}) => {
  const user = await register(request);
  await addToCart(page);
  const savedCart = await cart(page);
  expect(savedCart).toEqual([expect.objectContaining(ITEM)]);
  await page.reload();
  await expect(page.locator(".cart-item")).toHaveCount(1);
  expect(await cart(page)).toEqual(savedCart);

  await page.getByRole("link", { name: /Tiến hành đặt hàng/ }).click();
  await page.getByRole("button", { name: /Đăng nhập để tiếp tục/ }).click();
  await expect(page).toHaveURL(/\/login\?/);
  await login(page, user.email);
  await expect(page).toHaveURL(/\/checkout$/);
  expect(await cart(page)).toEqual(savedCart);
  await page.getByRole("button", { name: /Xác nhận đặt hàng/ }).click();
  await expect(
    page.getByRole("heading", { name: "Đơn của bạn đã sẵn sàng" }),
  ).toBeVisible();
  const displayedCode = await page.locator(".order-number strong").innerText();
  expect(displayedCode).toMatch(/^DH\d{8}$/);
  await expect(page.locator(".official-total")).toContainText("50.000");
  await page.getByRole("link", { name: /Tiến hành thanh toán/ }).click();
  await expect(page).toHaveURL(/\/payment\?orderId=/);
  const id = new URL(page.url()).searchParams.get("orderId");
  expect(id).toBeTruthy();
  const pending = await orderDetail(request, user, id!);
  expect(pending).toMatchObject({
    status: "PENDING",
    paymentCode: displayedCode,
    subtotal: TOTAL,
    discount: 0,
    total: TOTAL,
  });
  expect(pending.items).toEqual([
    expect.objectContaining({ ...ITEM, unitPrice: TOTAL, lineTotal: TOTAL }),
  ]);
  expect(pending.payments).toHaveLength(0);
  expect(pending.pointsEarned).toBeNull();

  const confirmation = page.waitForResponse(
    (response) =>
      response.url() === `${API}/payments` &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Xác nhận & Thanh toán" }).click();
  const session = await json<{ id: string; method: string; status: string }>(
    await confirmation,
  );
  expect(session).toMatchObject({ method: "SEPAY", status: "PROCESSING" });
  const processing = await orderDetail(request, user, id!);
  expect(processing.status).toBe("PENDING");
  expect(processing.payments).toEqual([
    expect.objectContaining({
      id: session.id,
      method: "SEPAY",
      status: "PROCESSING",
      amount: TOTAL,
    }),
  ]);
  expect(processing.pointsEarned).toBeNull();
  expect((await request.post(`${API}/orders/${id}/cancel`, { headers: user.headers })).status()).toBe(409);

  const qr = page.getByRole("img", { name: "Mã QR chuyển khoản VietQR" });
  await expect(qr).toBeVisible();
  const qrUrl = new URL((await qr.getAttribute("src"))!);
  expect(qrUrl.origin).toBe("https://vietqr.app");
  expect(Object.fromEntries(qrUrl.searchParams)).toMatchObject({
    bank: "970422",
    acc: "0000000000",
    amount: String(TOTAL),
    des: displayedCode,
  });
  expect(await cart(page)).toEqual(savedCart);

  const payload = transfer(pending);
  const accepted = await json<{ duplicate: boolean; orderId: string }>(
    await webhook(request, payload),
  );
  expect(accepted).toMatchObject({ duplicate: false, orderId: id });
  // Do not manually navigate: payment-page polling must reach the result screen.
  await expect(page).toHaveURL(/\/payment-status\?orderId=/);
  await expect(
    page.getByRole("heading", { name: "Thanh toán thành công" }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText(displayedCode);
  await expect.poll(() => cart(page)).toEqual([]);
  const paid = await orderDetail(request, user, id!);
  expect(paid.status).toBe("PAID");
  expect(paid.payments).toHaveLength(2);
  expect(paid.payments).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: session.id,
        method: "SEPAY",
        status: "FAILED",
        amount: TOTAL,
      }),
      expect.objectContaining({ status: "SUCCEEDED", amount: TOTAL }),
    ]),
  );
  expect(paid.pointsEarned).toBe(Math.floor(TOTAL / 10_000));
  const duplicate = await json<{ duplicate: boolean }>(
    await webhook(request, payload),
  );
  expect(duplicate.duplicate).toBe(true);
  const replayed = await orderDetail(request, user, id!);
  expect(replayed.payments).toEqual(paid.payments);
  expect(replayed.pointsEarned).toBe(paid.pointsEarned);
  await page.goto("/cart");
  await expect(
    page.getByRole("heading", { name: "Giỏ hàng đang trống" }),
  ).toBeVisible();
});

test("unpaid order keeps the cart and cancellation affects only that order", async ({
  page,
  request,
}) => {
  const user = await register(request);
  await addToCart(page);
  const savedCart = await cart(page);
  const order = await createOrder(request, user);
  await page.goto(
    `/login?returnUrl=${encodeURIComponent(`/payment?orderId=${order.id}`)}`,
  );
  await login(page, user.email);
  await expect(
    page.getByRole("button", { name: "Xác nhận & Thanh toán" }),
  ).toBeVisible();
  // Keep this cancellation case free of PROCESSING payments; confirmation is covered above.
  await page.goto(`/payment-status?orderId=${order.id}`);
  await expect(
    page.getByRole("heading", { name: "Đang chờ xác nhận thanh toán" }),
  ).toBeVisible();
  expect(await cart(page)).toEqual(savedCart);
  const pending = await orderDetail(request, user, order.id);
  expect(pending.status).toBe("PENDING");
  expect(pending.payments).toHaveLength(0);
  expect(pending.pointsEarned).toBeNull();
  await json(
    await request.post(`${API}/orders/${order.id}/cancel`, {
      headers: user.headers,
    }),
  );
  await expect(
    page.getByRole("heading", { name: "Đơn đã bị hủy" }),
  ).toBeVisible();
  expect(await cart(page)).toEqual(savedCart);
  expect((await orderDetail(request, user, order.id)).status).toBe("CANCELLED");
  expect((await webhook(request, transfer(order))).status()).toBe(409);
});

test("paying one order leaves another pending order untouched and private", async ({
  page,
  request,
}) => {
  const user = await register(request);
  const otherUser = await register(request);
  const a = await createOrder(request, user);
  const b = await createOrder(request, user);
  expect(
    (
      await request.get(`${API}/orders/${b.id}`, { headers: otherUser.headers })
    ).status(),
  ).toBe(404);
  await json(await webhook(request, transfer(a)));
  await page.goto(
    `/login?returnUrl=${encodeURIComponent(`/payment-status?orderId=${a.id}`)}`,
  );
  await login(page, user.email);
  await expect(
    page.getByRole("heading", { name: "Thanh toán thành công" }),
  ).toBeVisible();
  await page.goto(`/orders/${b.id}`);
  await expect(page.getByText("Chờ thanh toán").first()).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Thanh toán", exact: true }),
  ).toBeVisible();
  expect((await orderDetail(request, user, a.id)).status).toBe("PAID");
  const pending = await orderDetail(request, user, b.id);
  expect(pending.status).toBe("PENDING");
  expect(pending.payments).toHaveLength(0);
  await json(
    await request.post(`${API}/orders/${b.id}/cancel`, {
      headers: user.headers,
    }),
  );
});

for (const method of ["WALLET", "CARD"] as const) {
  test(`mock ${method} validates its actual outcome and idempotency without success retries`, async ({
    page,
    request,
  }) => {
    const user = await register(request);
    await addToCart(page);
    const savedCart = await cart(page);
    const order = await createOrder(request, user);
    const headers = { ...user.headers, "Idempotency-Key": randomUUID() };
    const data = { orderId: order.id, method };
    const payment = await json<Payment>(
      await request.post(`${API}/payments`, { headers, data }),
    );
    expect(["SUCCEEDED", "FAILED", "PROCESSING"]).toContain(payment.status);
    if (payment.status === "PROCESSING") {
      expect((await orderDetail(request, user, order.id)).status).toBe(
        "PENDING",
      );
      expect(
        (
          await request.post(`${API}/orders/${order.id}/cancel`, {
            headers: user.headers,
          })
        ).status(),
      ).toBe(409);
      const reconciled = await json<Payment>(
        await request.post(`${API}/payments/${payment.id}/reconcile`, {
          headers: user.headers,
        }),
      );
      expect(reconciled).toMatchObject({ id: payment.id, status: "SUCCEEDED" });
      expect((await orderDetail(request, user, order.id)).status).toBe("PAID");
    }
    const replay = await json<Payment>(
      await request.post(`${API}/payments`, { headers, data }),
    );
    expect(replay.id).toBe(payment.id);
    expect(replay.status).toBe(
      payment.status === "FAILED" ? "FAILED" : "SUCCEEDED",
    );
    const conflict = await request.post(`${API}/payments`, {
      headers,
      data: { ...data, method: method === "WALLET" ? "CARD" : "WALLET" },
    });
    expect(conflict.status()).toBe(409);
    const detail = await orderDetail(request, user, order.id);
    expect(detail.payments).toEqual([
      expect.objectContaining({
        id: payment.id,
        status: replay.status,
        amount: TOTAL,
        method,
      }),
    ]);
    expect(detail.status).toBe(
      replay.status === "SUCCEEDED" ? "PAID" : "PAYMENT_FAILED",
    );
    expect(detail.pointsEarned).toBe(
      replay.status === "SUCCEEDED" ? Math.floor(TOTAL / 10_000) : null,
    );
    await page.goto(
      `/login?returnUrl=${encodeURIComponent(`/payment-status?orderId=${order.id}`)}`,
    );
    await login(page, user.email);
    await expect(
      page.getByRole("heading", {
        name:
          replay.status === "SUCCEEDED"
            ? "Thanh toán thành công"
            : "Thanh toán không thành công",
      }),
    ).toBeVisible();
    if (replay.status === "SUCCEEDED") {
      await expect.poll(() => cart(page)).toEqual([]);
    } else {
      expect(await cart(page)).toEqual(savedCart);
      await json(
        await request.post(`${API}/orders/${order.id}/retry-payment`, {
          headers: user.headers,
        }),
      );
      const retried = await orderDetail(request, user, order.id);
      expect(retried.status).toBe("PENDING");
      expect(retried.paymentCode).not.toBe(order.paymentCode);
      await json(
        await request.post(`${API}/orders/${order.id}/cancel`, {
          headers: user.headers,
        }),
      );
    }
  });
}
