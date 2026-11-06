// TV6 — Giả lập webhook SePay để thử trang /payment-status khi chưa có trang thanh toán của TV5. CHỈ DÙNG KHI THỬ LOCAL.
// Dùng: SEPAY_WEBHOOK_API_KEY=<giá trị trong .env của API> node scripts/simulate-sepay.mjs <orderId> <tổng tiền VNĐ>
// Gửi POST /webhooks/sepay với nội dung "BREWLITE-ORDER-<orderId>" như ngân hàng báo tiền về.
// Backend sẽ ghi payment SUCCEEDED + đơn PAID + điểm thưởng trong một transaction; trang kết quả đang polling sẽ chuyển sang thành công.
// Mặc định chỉ chạy với API trên localhost; muốn gửi tới nơi khác phải đặt SIMULATE_ALLOW_REMOTE=1 (không dùng trên production).

const [orderId, amountRaw] = process.argv.slice(2);
const api = (process.env.SIMULATE_API_URL ?? "http://localhost:4000").replace(/\/+$/, "");
const key = process.env.SEPAY_WEBHOOK_API_KEY ?? "";

if (!orderId || !amountRaw) {
  console.error("Cách dùng: node scripts/simulate-sepay.mjs <orderId> <tổng tiền VNĐ>");
  process.exit(2);
}
const amount = Number(amountRaw);
if (!Number.isSafeInteger(amount) || amount < 0) {
  console.error("Tổng tiền phải là số nguyên VNĐ (đúng bằng tổng đơn).");
  process.exit(2);
}
if (!key) {
  console.error("Thiếu SEPAY_WEBHOOK_API_KEY (lấy từ .env local của API, không commit).");
  process.exit(2);
}
const host = new URL(api).hostname;
if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(host) && process.env.SIMULATE_ALLOW_REMOTE !== "1") {
  console.error(`Từ chối gửi tới ${host}: script này chỉ để thử local (đặt SIMULATE_ALLOW_REMOTE=1 nếu thật sự cần).`);
  process.exit(2);
}

// id giao dịch phải là số nguyên và duy nhất; gửi lại cùng id sẽ được coi là trùng (duplicate).
const transactionId = Number(process.env.SIMULATE_TRANSACTION_ID ?? Date.now());
const payload = {
  id: transactionId,
  gateway: "SIMULATED",
  transactionDate: new Date().toISOString().slice(0, 19).replace("T", " "),
  accountNumber: "0000000000",
  subAccount: null,
  code: null,
  content: `BREWLITE-ORDER-${orderId}`,
  transferType: "in",
  description: "Giả lập webhook SePay (thử local)",
  transferAmount: amount,
  accumulated: null,
  referenceCode: `SIM-${transactionId}`,
};

const response = await fetch(`${api}/webhooks/sepay`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Apikey ${key}` },
  body: JSON.stringify(payload),
  signal: AbortSignal.timeout(10_000),
});
const text = await response.text();
console.log(`HTTP ${response.status}\n${text}`);
process.exit(response.ok ? 0 : 1);
