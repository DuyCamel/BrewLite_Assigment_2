// TV6 — E2E luồng khách hàng: menu → chi tiết → giỏ → đăng nhập → đặt đơn → thanh toán → PAID.
// Chạy trên stack Docker: web http://localhost:3000, API http://localhost:4000 (docker compose up --build,
// đã chạy db:migrate + db:seed). Mỗi lần chạy tự đăng ký một tài khoản mới, không dùng lại tài khoản của người khác.
//
// Biến môi trường:
//   E2E_WEB_URL            (mặc định http://localhost:3000, đọc trong playwright.config.ts)
//   E2E_API_URL            (mặc định http://localhost:4000)
//   SEPAY_WEBHOOK_API_KEY  (cần cho các test "tiền về"; phải trùng giá trị API đang dùng; thiếu thì test đó bị bỏ qua)
//   E2E_WAIT_EXPIRY_JOB=1  (tùy chọn: chờ qua vài chu kỳ job hủy đơn quá hạn, mất ~20 giây)
//
// Vì sao PAID dùng webhook SePay: trang /payment hiện chỉ có luồng QR chuyển khoản (không còn nút Ví/Thẻ mô phỏng), tiền về
// qua POST /webhooks/sepay nên test giả lập đúng bước đó và có kết quả cố định.
// Cổng mô phỏng Ví/Thẻ (POST /payments) vẫn còn ở backend và do test của TV5 phụ trách, không nằm trong file này.
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

const API = (process.env.E2E_API_URL ?? "http://localhost:4000").replace(
  /\/+$/,
  "",
);
const SEPAY_KEY = process.env.SEPAY_WEBHOOK_API_KEY ?? "";
const PASSWORD = "BrewLite123!";
const PRODUCT_ID = "ca-phe-sua"; // có trong apps/api/database/002_seed.sql

type OrderView = { id: string; status: string; total: number };

function uniqueEmail(): string {
  return `e2e-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@brewlite.test`;
}

async function registerUser(
  request: APIRequestContext,
): Promise<{ email: string; token: string }> {
  const email = uniqueEmail();
  const registered = await request.post(`${API}/auth/register`, {
    data: { email, password: PASSWORD },
  });
  expect(registered.ok(), `đăng ký: mã ${registered.status()}`).toBeTruthy();
  const login = await request.post(`${API}/auth/login`, {
    data: { email, password: PASSWORD },
  });
  expect(login.ok(), `đăng nhập: mã ${login.status()}`).toBeTruthy();
  const body = (await login.json()) as { accessToken?: string };
  expect(body.accessToken, "thiếu accessToken").toBeTruthy();
  return { email, token: body.accessToken as string };
}

async function createOrder(
  request: APIRequestContext,
  token: string,
): Promise<{ orderId: string; total: number }> {
  const response = await request.post(`${API}/orders`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      items: [
        { productId: PRODUCT_ID, size: "M", toppingIds: ["cream"], quantity: 1 },
      ],
    },
  });
  expect(response.ok(), `tạo đơn: mã ${response.status()}`).toBeTruthy();
  return (await response.json()) as { orderId: string; total: number };
}

async function getOrder(
  request: APIRequestContext,
  token: string,
  orderId: string,
): Promise<OrderView> {
  const response = await request.get(`${API}/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.ok(), `đọc đơn: mã ${response.status()}`).toBeTruthy();
  return (await response.json()) as OrderView;
}

// Giả lập ngân hàng báo tiền về (cùng định dạng scripts/simulate-sepay.mjs).
async function payBySepay(
  request: APIRequestContext,
  orderId: string,
  amount: number,
): Promise<void> {
  const transactionId = Date.now() * 1000 + Math.floor(Math.random() * 1000);
  const response = await request.post(`${API}/webhooks/sepay`, {
    headers: { Authorization: `Apikey ${SEPAY_KEY}` },
    data: {
      id: transactionId,
      gateway: "E2E",
      content: `BREWLITE-ORDER-${orderId}`,
      transferType: "in",
      transferAmount: amount,
      referenceCode: `E2E-${transactionId}`,
    },
  });
  expect(
    response.ok(),
    `webhook SePay: mã ${response.status()} ${await response.text()}`,
  ).toBeTruthy();
}

async function loginViaUi(page: Page, email: string, returnUrl = "/") {
  await page.goto(`/login?returnUrl=${encodeURIComponent(returnUrl)}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  // Chờ rời trang đăng nhập (phiên đã lưu) rồi mới điều hướng tiếp, tránh page.goto ngắt giữa chừng yêu cầu đăng nhập.
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

test.describe("Khách hàng đặt món", () => {
  test("menu → giỏ → đăng nhập → đặt đơn → thanh toán → PAID", async ({
    page,
    request,
  }) => {
    test.skip(
      !SEPAY_KEY,
      "Thiếu SEPAY_WEBHOOK_API_KEY nên không giả lập được tiền về",
    );
    const { email, token } = await registerUser(request);

    // 1. Menu → chi tiết món → chọn size, topping → thêm vào giỏ.
    await page.goto("/");
    await page.locator(`a[href="/products/${PRODUCT_ID}"]`).first().click();
    await expect(page).toHaveURL(new RegExp(`/products/${PRODUCT_ID}$`));
    await page.getByRole("button", { name: /^Size M/ }).click();
    await page.getByRole("checkbox", { name: /Kem sữa/ }).check();
    await page.getByRole("button", { name: /Thêm vào giỏ hàng/ }).click();

    // 2. Giỏ hàng → tiến hành đặt hàng.
    await page.goto("/cart");
    await expect(
      page.getByRole("heading", { name: "Giỏ hàng", level: 1 }),
    ).toBeVisible();
    await page.locator('a.summary-button[href="/checkout"]').click();

    // 3. Chưa đăng nhập: bị đưa tới /login, đăng nhập xong quay lại /checkout và giỏ vẫn còn.
    await page.getByRole("button", { name: /Đăng nhập để tiếp tục/ }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Mật khẩu", { exact: true }).fill(PASSWORD);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/checkout/);

    // 4. Đặt đơn: máy chủ trả mã đơn và tổng tiền chính thức.
    await page.getByRole("button", { name: "Xác nhận đặt hàng" }).click();
    await expect(
      page.getByRole("heading", { name: "Đơn của bạn đã sẵn sàng" }),
    ).toBeVisible();
    const payLink = page.locator('a[href^="/payment?orderId="]');
    const href = (await payLink.getAttribute("href")) ?? "";
    const orderId = decodeURIComponent(href.split("orderId=")[1] ?? "");
    expect(orderId).not.toBe("");

    // 5. Trang thanh toán hiện ra, đơn đang chờ tiền.
    await payLink.click();
    await expect(
      page.getByRole("heading", { name: "Thanh toán không tiền mặt" }),
    ).toBeVisible();
    const pending = await getOrder(request, token, orderId);
    expect(pending.status).toBe("PENDING");

    // 6. Mở trang kết quả (đang polling) rồi để "ngân hàng" báo tiền về → PAID.
    await page.goto(`/payment-status?orderId=${encodeURIComponent(orderId)}`);
    await payBySepay(request, orderId, pending.total);
    await expect(
      page.getByRole("heading", { name: "Thanh toán thành công" }),
    ).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(async () => (await getOrder(request, token, orderId)).status)
      .toBe("PAID");

    // 7. Giỏ chỉ bị xóa sau khi PAID.
    await page.goto("/cart");
    await expect(
      page.getByRole("heading", { name: "Giỏ hàng đang trống" }),
    ).toBeVisible();
  });

  test("trang thanh toán QR: đơn vẫn PENDING, trang kết quả chờ tiền và không hủy nhầm", async ({
    page,
    request,
  }) => {
    const { email, token } = await registerUser(request);
    const { orderId } = await createOrder(request, token);

    await loginViaUi(page, email, "/");
    await page.goto(`/payment?orderId=${encodeURIComponent(orderId)}`);
    await expect(
      page.getByRole("heading", { name: "Thanh toán không tiền mặt" }),
    ).toBeVisible();

    // Chưa có tiền về: trang kết quả phải ở trạng thái chờ, không báo thành công hay thất bại, không hủy đơn.
    await page
      .getByRole("link", { name: "Xem trạng thái thanh toán" })
      .click();
    await expect(page).toHaveURL(/\/payment-status/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      /Đang chờ xác nhận thanh toán/,
    );
    expect((await getOrder(request, token, orderId)).status).toBe("PENDING");
  });
});

test.describe("Nhiều đơn PENDING độc lập (lỗi tự hủy đơn)", () => {
  test("một đơn PAID không làm đổi đơn PENDING khác của cùng khách", async ({
    page,
    request,
  }) => {
    test.skip(
      !SEPAY_KEY,
      "Thiếu SEPAY_WEBHOOK_API_KEY nên không giả lập được tiền về",
    );
    const { email, token } = await registerUser(request);
    const orderA = await createOrder(request, token);
    const orderB = await createOrder(request, token);

    await payBySepay(request, orderA.orderId, orderA.total);
    await expect
      .poll(async () => (await getOrder(request, token, orderA.orderId)).status)
      .toBe("PAID");

    // Xem trang kết quả của A rồi chi tiết của B (đúng thao tác "xem đơn" trong báo lỗi).
    await loginViaUi(page, email, "/");
    await page.goto(
      `/payment-status?orderId=${encodeURIComponent(orderA.orderId)}`,
    );
    await expect(
      page.getByRole("heading", { name: "Thanh toán thành công" }),
    ).toBeVisible();
    await page.goto(`/orders/${encodeURIComponent(orderB.orderId)}`);
    await expect(page.getByText("Chờ thanh toán").first()).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Thanh toán", exact: true }),
    ).toBeVisible();

    // Không có thao tác nào ngầm hủy đơn B; đơn A vẫn PAID.
    expect((await getOrder(request, token, orderB.orderId)).status).toBe(
      "PENDING",
    );
    expect((await getOrder(request, token, orderA.orderId)).status).toBe(
      "PAID",
    );
  });

  test("job hủy đơn quá hạn không hủy đơn PENDING chưa hết hạn", async ({
    request,
  }) => {
    test.skip(
      process.env.E2E_WAIT_EXPIRY_JOB !== "1",
      "Đặt E2E_WAIT_EXPIRY_JOB=1 để chạy (mất ~20 giây)",
    );
    test.setTimeout(90_000);
    const { token } = await registerUser(request);
    const order = await createOrder(request, token);

    // OrderExpiryJob chạy mỗi 5 giây; đơn mới (hết hạn sau ORDER_TTL_MINUTES, mặc định 15 phút) phải còn nguyên sau nhiều chu kỳ.
    await new Promise((resolve) => setTimeout(resolve, 20_000));
    expect((await getOrder(request, token, order.orderId)).status).toBe(
      "PENDING",
    );
  });
});
