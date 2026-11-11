"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { OrderDetail } from "@/types/customer-order";
import { fetchOrderDetail, reissueOrderQr, retryOrderPayment } from "@/lib/client-api";
import { authorizedRequest } from "@/features/auth/auth.service"; 
import { formatVnd } from "@/features/orders/order-format";
import { ErrorBlock, LoadingBlock } from "@/components/orders/OrderBlocks";
import "./payment.css";

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
  const [isProcessing, setIsProcessing] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // STATE: Quản lý chọn phương thức
  const [paymentMethod, setPaymentMethod] = useState<"SEPAY" | "WALLET">("SEPAY");
  const [paymentSession, setPaymentSession] = useState<any>(null);

  const qrBankId = process.env.NEXT_PUBLIC_VIETQR_BANK_ID;
  const qrAccountNo = process.env.NEXT_PUBLIC_VIETQR_ACCOUNT_NO;
  const qrAccountName = process.env.NEXT_PUBLIC_VIETQR_ACCOUNT_NAME ?? "";
  const transferDescription = order?.paymentCode ?? "";

  const currentAmount = paymentSession ? paymentSession.amount : (order?.total || 0);

  const qrUrl = order?.paymentCode && qrBankId && qrAccountNo
    ? `https://vietqr.app/img?${new URLSearchParams({ acc: qrAccountNo, bank: qrBankId, amount: String(currentAmount), des: transferDescription, template: "compact", showinfo: "true", holder: qrAccountName })}`
    : null;
    
  const secondsLeft = order ? Math.max(0, Math.ceil((Date.parse(order.qrExpiresAt) - now) / 1000)) : 0;
  const orderSecondsLeft = order ? Math.max(0, Math.ceil((Date.parse(order.expiresAt) - now) / 1000)) : 0;

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
    const loadOrder = async () => {
      try {
        const orderData = await fetchOrderDetail(orderId, new AbortController().signal);
        setOrder(orderData);
        if (["PAID", "PREPARING", "READY", "COMPLETED"].includes(orderData.status)) {
          router.push(`/payment-status?orderId=${orderId}`);
        }
      } catch (err: any) {
        setError(err.message || "Không thể tải thông tin đơn hàng");
      } finally {
        setLoading(false);
      }
    };
    loadOrder();
  }, [orderId, router]);

  // Vòng lặp kiểm tra trạng thái đơn liên tục (Polling)
  useEffect(() => {
    if (order?.status !== "PENDING" || !orderId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const checkOrder = async () => {
      try {
        const latest = await fetchOrderDetail(orderId, controller.signal);
        if (controller.signal.aborted) return;
        if (latest.status !== "PENDING") {
          router.replace(`/payment-status?orderId=${encodeURIComponent(orderId)}`);
          return;
        }
        setOrder(latest);
      } catch {
        if (controller.signal.aborted) return;
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
    if (!order || isProcessing) return;
    setIsProcessing(true);
    setError("");
    try {
      const idempotencyKey = crypto.randomUUID(); 
      const result = await authorizedRequest("/payments", {
        method: "POST",
        headers: { 
          "Idempotency-Key": idempotencyKey,
          "Content-Type": "application/json" // Giữ lại dòng này để Backend biết đây là JSON
        },
        body: { 
          orderId: order.id,
          method: paymentMethod
        } // BỎ JSON.stringify đi, để nguyên Object cho authorizedRequest tự xử lý
      });
      setPaymentSession(result);
    } catch (err: any) {
      setError(err.message || "Không thể khởi tạo thanh toán.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePayment = async () => {
    if (!order || isProcessing || order.status !== "PAYMENT_FAILED") return;
    setIsProcessing(true);
    setError("");
    try {
      await retryOrderPayment(order.id);
      setOrder(await fetchOrderDetail(order.id, new AbortController().signal));
      setNow(Date.now());
      setPaymentSession(null); 
    } catch (err: any) {
      setError(err.message || "Không thể chuẩn bị thanh toán. Hãy thử lại.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReissue = async () => {
    if (!order || isProcessing || order.status !== "PENDING" || order.qrAttempts !== 1 || secondsLeft > 0 || orderSecondsLeft === 0) return;
    setIsProcessing(true);
    setError("");
    try {
      await reissueOrderQr(order.id);
      setOrder(await fetchOrderDetail(order.id));
      setNow(Date.now());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Không thể cấp lại QR.");
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading) return <section className="container ord-page"><LoadingBlock text="Đang tải thông tin đơn hàng" /></section>;
  if (!order) return <section className="container ord-page"><ErrorBlock title="Lỗi thanh toán" message={error || "Đơn hàng không hợp lệ"} /><Link href="/" className="outline-button">Quay về trang chủ</Link></section>;

  return (
    <section className="container ord-page">
      <h1>Thanh toán đơn hàng</h1>
      <p className="ord-sub">Đơn #{order.paymentCode} · {formatVnd(order.total)}</p>
      <div className="pay-panel">
        
        {error && <p className="pay-note" style={{ color: 'red', marginBottom: '1rem' }} role="alert">{error}</p>}
        {orderSecondsLeft === 0 && order.status === "PENDING" && <p className="pay-note" role="status">Đơn đã hết hạn, đang chờ hủy và hoàn tồn.</p>}
        {secondsLeft === 0 && orderSecondsLeft > 0 && order.status === "PENDING" && paymentSession && <p className="pay-note" role="status">QR đã hết hạn.</p>}

        {/* BƯỚC 1: CHỌN PHƯƠNG THỨC */}
        {order.status === "PENDING" && !paymentSession && secondsLeft > 0 && (
          <div className="payment-setup" style={{ background: "#f9fafb", padding: "1.5rem", borderRadius: "8px" }}>
            <h2 style={{ marginTop: 0 }}>Tùy chọn thanh toán</h2>
            <div style={{ marginBottom: "1.5rem" }}>
              <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "600" }}>Phương thức thanh toán:</label>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as any)} style={{ padding: "0.75rem", width: "100%", border: "1px solid #ccc", borderRadius: "4px" }}>
                <option value="SEPAY">Chuyển khoản QR (SePay)</option>
                <option value="WALLET">Ví điện tử (Mô phỏng)</option>
              </select>
            </div>
            <div style={{ marginBottom: "1.5rem", fontSize: "1.2rem" }}>
              Số tiền thanh toán: <strong style={{ color: "#e11d48" }}>{formatVnd(currentAmount)}</strong>
            </div>
            <button type="button" className="primary-button" onClick={handleConfirmPayment} disabled={isProcessing} style={{ width: "100%" }}>
              {isProcessing ? "Đang xử lý..." : "Xác nhận & Thanh toán"}
            </button>
          </div>
        )}

        {/* BƯỚC 2A: HIỆN QR SEPAY */}
        {order.status === "PENDING" && paymentSession?.method === "SEPAY" && currentAmount > 0 && secondsLeft > 0 && qrUrl && (
          <div className="pay-qr" style={{ marginTop: "1.5rem", borderTop: "2px dashed #eee", paddingTop: "1.5rem" }}>
            <h2>Quét mã QR để chuyển khoản</h2>
            <img className="pay-qr-image" src={qrUrl} alt="Mã QR chuyển khoản VietQR" />
            <p style={{ fontSize: "1.2rem", margin: "1rem 0" }}>Số tiền: <strong style={{ color: "#e11d48" }}>{formatVnd(currentAmount)}</strong></p>
            <p>Nội dung chuyển khoản: <strong>{transferDescription}</strong></p>
            <p style={{ color: "#6b7280", fontSize: "0.9rem" }}>Đang chờ hệ thống xác nhận tiền vào.</p>
          </div>
        )}

        {/* BƯỚC 2B: CHỜ VÍ MÔ PHỎNG */}
        {order.status === "PENDING" && paymentSession && paymentSession.method === "WALLET" && (
          <div className="pay-qr" style={{ marginTop: "1.5rem", textAlign: "center", padding: "2rem" }}>
            <h2>Đang xử lý giao dịch...</h2>
            <div className="loading-spinner" style={{ marginTop: "1rem" }}>⏳</div>
          </div>
        )}
      </div>

      <div className="ord-actions">
        {order.status === "PAYMENT_FAILED" ? (
          <button type="button" className="primary-button" onClick={handlePayment} disabled={isProcessing}>Thử lại thanh toán</button>
        ) : (
          <Link className="outline-button" href={`/orders/${order.id}`} style={{ marginTop: "1rem" }}>Xem chi tiết đơn hàng</Link>
        )}
      </div>
    </section>
  );
}