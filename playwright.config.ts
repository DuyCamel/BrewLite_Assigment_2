// TV6 — Cấu hình Playwright cho E2E (chạy trên stack Docker, không tự bật server).
// Chạy: npx playwright test   (cần web http://localhost:3000 và API http://localhost:4000 đang chạy bằng docker compose)
// Biến môi trường: E2E_WEB_URL, E2E_API_URL, SEPAY_WEBHOOK_API_KEY (xem tests/e2e/checkout.spec.ts).
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.spec.ts",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"]],
  use: {
    baseURL: process.env.E2E_WEB_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "vi-VN",
  },
  // Mobile-first theo đề: chạy bằng viewport điện thoại (Chromium).
  projects: [{ name: "mobile-chromium", use: { ...devices["Pixel 7"] } }],
});
