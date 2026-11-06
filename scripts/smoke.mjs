// TV6 — Smoke test sau deploy (không cần cài thêm gói nào, chỉ cần Node 22+).
// Dùng: SMOKE_API_URL=https://api.example.com SMOKE_WEB_URL=https://example.com node scripts/smoke.mjs
// Muốn kiểm tra cả luồng đăng nhập + đọc đơn: thêm SMOKE_EMAIL và SMOKE_PASSWORD (tài khoản thử, KHÔNG dùng tài khoản thật).
// Chỉ ĐỌC dữ liệu (GET + đăng nhập), không tạo/sửa/xóa đơn. Thoát mã 1 nếu có bước lỗi để CD biết mà rollback.

const api = (process.env.SMOKE_API_URL ?? "http://localhost:4000").replace(/\/+$/, "");
const web = (process.env.SMOKE_WEB_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const email = process.env.SMOKE_EMAIL ?? "";
const password = process.env.SMOKE_PASSWORD ?? "";
const TIMEOUT_MS = 10_000;

let failed = 0;

async function call(url, init = {}) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  return { status: response.status, body, text };
}

async function step(name, run) {
  try {
    await run();
    console.log(`  ok    ${name}`);
  } catch (error) {
    failed += 1;
    const reason = error instanceof Error ? error.message : String(error);
    console.log(`  FAIL  ${name} — ${reason}`);
  }
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

console.log(`Smoke test\n  API: ${api}\n  WEB: ${web}`);

await step("GET /health trả 200 và status ok", async () => {
  const { status, body } = await call(`${api}/health`);
  expect(status === 200, `mã ${status}, mong 200`);
  expect(body?.status === "ok", "body.status không phải ok");
  // Production phải kiểm tra DB thật; sample mode không được dùng để nghiệm thu.
  expect(body?.database === "up", `database = ${body?.database}, mong "up"`);
});

await step("GET /products trả danh sách món", async () => {
  const { status, body } = await call(`${api}/products`);
  expect(status === 200, `mã ${status}, mong 200`);
  const items = Array.isArray(body) ? body : body?.products;
  expect(Array.isArray(items) && items.length > 0, "danh sách món rỗng hoặc sai dạng");
});

await step("GET /orders/me KHÔNG token trả 401 (API đóng)", async () => {
  const { status } = await call(`${api}/orders/me`);
  expect(status === 401, `mã ${status}, mong 401`);
});

await step("GET /orders/me với token rác trả 401", async () => {
  const { status } = await call(`${api}/orders/me`, {
    headers: { Authorization: "Bearer khong.phai.token" },
  });
  expect(status === 401, `mã ${status}, mong 401`);
});

await step(`GET ${web}/ trả 200`, async () => {
  const response = await fetch(web, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  expect(response.status === 200, `mã ${response.status}, mong 200`);
});

if (email && password) {
  let token = "";
  await step("POST /auth/login bằng tài khoản thử", async () => {
    const { status, body } = await call(`${api}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    expect(status === 200 || status === 201, `mã ${status}, mong 200/201`);
    expect(typeof body?.accessToken === "string" && body.accessToken !== "", "không có accessToken");
    token = body.accessToken;
  });

  if (token) {
    const auth = { Authorization: `Bearer ${token}` };
    await step("GET /orders/me với token hợp lệ trả 200 + danh sách đơn", async () => {
      const { status, body } = await call(`${api}/orders/me?limit=5&offset=0`, { headers: auth });
      expect(status === 200, `mã ${status}, mong 200`);
      expect(Array.isArray(body?.orders), "thiếu mảng orders");
      expect(typeof body?.hasMore === "boolean", "thiếu hasMore");
    });
    await step("GET /orders/<mã không tồn tại> trả 404 (không lộ đơn người khác)", async () => {
      const { status } = await call(`${api}/orders/smoke-khong-ton-tai`, { headers: auth });
      expect(status === 404, `mã ${status}, mong 404`);
    });
  }
} else {
  console.log("  bỏ qua kiểm tra đăng nhập/đơn (chưa đặt SMOKE_EMAIL và SMOKE_PASSWORD)");
}

if (failed > 0) {
  console.log(`\n${failed} bước lỗi.`);
  process.exit(1);
}
console.log("\nTất cả bước đạt.");
