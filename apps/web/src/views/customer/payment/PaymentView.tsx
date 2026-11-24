"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { OrderDetail, PaymentMethod, PaymentSession } from "@/types/customer-order";
import { createPayment, describeError, fetchOrderDetail, reconcilePayment, retryOrderPayment } from "@/lib/client-api";
import { formatVnd } from "@/features/orders/order-format";
import { ErrorBlock, LoadingBlock } from "@/components/orders/OrderBlocks";
import "./payment.css";

function generateUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function PaymentView() {
  return (
    <Suspense fallback={<LoadingBlock text="Đang tải thông tin thanh toán" />}>
      <PaymentContent />
    </Suspense>
  );
}

function PaymentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId");

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pollError, setPollError] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("SEPAY");
  const [paymentSession, setPaymentSession] = useState<PaymentSession | null>(null);
  const [qrReloadCount, setQrReloadCount] = useState(0);
  const [qrLoadError, setQrLoadError] = useState(false);

  const qrBankId = process.env.NEXT_PUBLIC_VIETQR_BANK_ID;
  const qrAccountNo = process.env.NEXT_PUBLIC_VIETQR_ACCOUNT_NO;
  const qrAccountName = process.env.NEXT_PUBLIC_VIETQR_ACCOUNT_NAME ?? "";
  const transferDescription = order?.paymentCode ?? "";

  const currentAmount = paymentSession ? paymentSession.amount : (order?.total || 0);

  const qrUrl = order?.paymentCode && qrBankId && qrAccountNo
    ? `https://vietqr.app/img?${new URLSearchParams({ acc: qrAccountNo, bank: qrBankId, amount: String(currentAmount), des: transferDescription, template: "compact", showinfo: "true", holder: qrAccountName, ...(qrReloadCount > 0 ? { _r: String(qrReloadCount) } : {}) })}`
    : null;
    
  const secondsLeft = order ? Math.max(0, Math.ceil((Date.parse(order.qrExpiresAt) - now) / 1000)) : 0;
  const orderSecondsLeft = order ? Math.max(0, Math.ceil((Date.parse(order.expiresAt) - now) / 1000)) : 0;
  const orderValid = orderSecondsLeft > 0;

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!orderId) {
      setError("Không tìm thấy mã đơn hàng");
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const loadOrder = async () => {
      try {
        const orderData = await fetchOrderDetail(orderId, controller.signal);
        if (controller.signal.aborted) return;
        setOrder(orderData);
        setPaymentSession(orderData.payments.find((payment) => payment.status === "PROCESSING") ?? null);
        if (["PAID", "PREPARING", "READY", "COMPLETED"].includes(orderData.status)) {
          router.push(`/payment-status?orderId=${orderId}`);
        }
      } catch (err: unknown) {
        if (controller.signal.aborted) return;
        setError(describeError(err));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    loadOrder();
    return () => controller.abort();
  }, [orderId, router]);

  // Vòng lặp kiểm tra trạng thái đơn liên tục (Polling)
  useEffect(() => {
    if (order?.status !== "PENDING" || !orderId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const checkOrder = async () => {
      try {
        let latest = await fetchOrderDetail(orderId, controller.signal);
        const active = latest.payments.find((payment) => payment.status === "PROCESSING");
        let reconcileError = "";
        if (active && active.method !== "SEPAY") {
          try {
            await reconcilePayment(active.id, controller.signal);
          } catch (err: unknown) {
            if (controller.signal.aborted) return;
            reconcileError = `${describeError(err)} Giao dịch chưa được xác nhận; không thanh toán lại.`;
          }
          latest = await fetchOrderDetail(orderId, controller.signal);
        }
        if (controller.signal.aborted) return;
        if (latest.status !== "PENDING") {
          router.replace(`/payment-status?orderId=${encodeURIComponent(orderId)}`);
          return;
        }
        setOrder(latest);
        setPaymentSession(latest.payments.find((payment) => payment.status === "PROCESSING") ?? null);
        setPollError(reconcileError);
      } catch (err: unknown) {
        if (controller.signal.aborted) return;
        setPollError(`${describeError(err)} Đang kiểm tra lại; chưa thể kết luận thanh toán thất bại.`);
      }
      timer = setTimeout(checkOrder, 2000);
    };
    timer = setTimeout(checkOrder, 2000);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [order?.status, orderId, router]);

  const handleConfirmPayment = async () => {
    if (!order || isProcessing || paymentSession || order.status !== "PENDING" || !orderValid || (paymentMethod === "SEPAY" && (secondsLeft === 0 || !qrUrl))) return;
    setIsProcessing(true);
    setError("");
    try {
      // Keep the key across uncertain network outcomes, including a page refresh.
      const storageKey = `payment:${order.id}:${order.paymentCode}:${paymentMethod}`;
      const idempotencyKey = sessionStorage.getItem(storageKey) ?? generateUUID();
      sessionStorage.setItem(storageKey, idempotencyKey);
      const result = await createPayment(order.id, paymentMethod, idempotencyKey);
      setPaymentSession(result);
      if (result.status !== "PROCESSING") router.replace(`/payment-status?orderId=${encodeURIComponent(order.id)}`);
    } catch (err: unknown) {
      setError(`${describeError(err)} Nếu chưa nhận được kết quả, hãy kiểm tra lại hoặc thử lại cùng phương thức; không chuyển tiền lần nữa.`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePayment = async () => {
    if (!order || isProcessing || !order.canRetryPayment) return;
    setIsProcessing(true);
    setError("");
    try {
      await retryOrderPayment(order.id);
      setOrder(await fetchOrderDetail(order.id, new AbortController().signal));
      setNow(Date.now());
      setPaymentSession(null); 
    } catch (err: unknown) {
      setError(describeError(err));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReloadQr = () => {
    setQrLoadError(false);
    setQrReloadCount((count) => count + 1);
  };

  if (loading) return <section className="container ord-page"><LoadingBlock text="Đang tải thông tin đơn hàng" /></section>;
  if (!order) return <section className="container ord-page"><ErrorBlock title="Lỗi thanh toán" message={error || "Đơn hàng không hợp lệ"} /><Link href="/" className="outline-button">Quay về trang chủ</Link></section>;

  return (
    <section className="container ord-page">
      <h1>Thanh toán đơn hàng</h1>
      <p className="ord-sub">Đơn #{order.paymentCode} · {formatVnd(order.total)}</p>
      <div className="pay-panel">
        
        {error && <p className="pay-note" style={{ color: 'red', marginBottom: '1rem' }} role="alert">{error}</p>}
        {pollError && <p className="pay-note" role="alert">{pollError}</p>}
        {order.status === "PENDING" && <p className="pay-note">Thời gian giữ đơn: {orderSecondsLeft} giây. Hiệu lực QR: {secondsLeft} giây.</p>}
        {!orderValid && order.status === "PENDING" && <p className="pay-note" role="status">Đơn đã hết hạn. Giao dịch đang xử lý (nếu có) vẫn chờ xác nhận; không thanh toán lại.</p>}
        {secondsLeft === 0 && order.status === "PENDING" && <p className="pay-note" role="status">QR đã hết hạn. Không chuyển khoản bằng mã QR cũ.</p>}
        {!qrUrl && order.status === "PENDING" && <p className="pay-note" role="alert">Chưa cấu hình ngân hàng hoặc số tài khoản nhận tiền. Chuyển khoản QR chưa sẵn sàng; hãy chọn thẻ hoặc ví điện tử.</p>}

        {/* BƯỚC 1: CHỌN PHƯƠNG THỨC */}
        {order.status === "PENDING" && !paymentSession && orderValid && (
          <div className="payment-setup" style={{ background: "#f9fafb", padding: "1.5rem", borderRadius: "8px" }}>
            <h2 style={{ marginTop: 0 }}>Tùy chọn thanh toán</h2>
            <div style={{ marginBottom: "1.5rem" }}>
              <label htmlFor="payment-method" style={{ display: "block", marginBottom: "0.5rem", fontWeight: "600" }}>Phương thức thanh toán:</label>
              <select id="payment-method" value={paymentMethod} disabled={isProcessing} onChange={(e) => { const method = e.target.value; if (method === "SEPAY" || method === "WALLET" || method === "CARD") setPaymentMethod(method); }} style={{ padding: "0.75rem", width: "100%", border: "1px solid #ccc", borderRadius: "4px" }}>
                <option value="SEPAY">Chuyển khoản QR (SePay)</option>
                <option value="WALLET">Ví điện tử (Mô phỏng)</option>
                <option value="CARD">Thẻ (Mô phỏng)</option>
              </select>
            </div>
            <div style={{ marginBottom: "1.5rem", fontSize: "1.2rem" }}>
              Số tiền thanh toán: <strong style={{ color: "#e11d48" }}>{formatVnd(currentAmount)}</strong>
            </div>
            <button type="button" className="primary-button" onClick={handleConfirmPayment} disabled={isProcessing || (paymentMethod === "SEPAY" && (secondsLeft === 0 || !qrUrl))} style={{ width: "100%" }}>
              {isProcessing ? "Đang xử lý..." : "Xác nhận & Thanh toán"}
            </button>
          </div>
        )}

        {/* BƯỚC 2A: HIỆN QR SEPAY (1 mã QR duy nhất gắn theo đơn; chỉ tắt khi QR hết hạn) */}
        {order.status === "PENDING" && orderValid && paymentSession?.method === "SEPAY" && currentAmount > 0 && secondsLeft > 0 && qrUrl && (
          <div className="pay-qr" style={{ marginTop: "1.5rem", borderTop: "2px dashed #eee", paddingTop: "1.5rem" }}>
            <h2>Quét mã QR để chuyển khoản</h2>
            {qrLoadError ? (
              <p className="pay-note" role="alert">Không tải được ảnh mã QR. Hãy bấm nút bên dưới để tải lại.</p>
            ) : (
              <img
                className="pay-qr-image"
                src={qrUrl}
                alt="Mã QR chuyển khoản VietQR"
                onLoad={() => setQrLoadError(false)}
                onError={() => setQrLoadError(true)}
              />
            )}
            <button type="button" className="outline-button" onClick={handleReloadQr} style={{ marginTop: "0.5rem" }}>
              Tải lại mã QR
            </button>
            <p style={{ fontSize: "1.2rem", margin: "1rem 0" }}>Số tiền: <strong style={{ color: "#e11d48" }}>{formatVnd(currentAmount)}</strong></p>
            <p>Nội dung chuyển khoản: <strong>{transferDescription}</strong></p>
            <p style={{ color: "#6b7280", fontSize: "0.9rem" }}>Đang chờ hệ thống xác nhận tiền vào.</p>
          </div>
        )}

        {/* BƯỚC 2B: CHỜ VÍ MÔ PHỎNG */}
        {order.status === "PENDING" && paymentSession && paymentSession.method !== "SEPAY" && (
          <div className="pay-qr" style={{ marginTop: "1.5rem", textAlign: "center", padding: "2rem" }}>
            <h2>Đang xử lý giao dịch...</h2>
            <p role="status">Giao dịch {paymentSession.method === "CARD" ? "thẻ" : "ví điện tử"} đang chờ xác nhận. Không thanh toán lại.</p>
          </div>
        )}
      </div>

      <div className="ord-actions">
        {order.canRetryPayment ? (
          <button type="button" className="primary-button" onClick={handlePayment} disabled={isProcessing}>Thử lại thanh toán</button>
        ) : (
          <Link className="outline-button" href={`/orders/${order.id}`} style={{ marginTop: "1rem" }}>Xem chi tiết đơn hàng</Link>
        )}
      </div>
    </section>
  );
}
