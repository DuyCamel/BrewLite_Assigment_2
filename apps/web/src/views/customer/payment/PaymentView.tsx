"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { OrderDetail } from "@/types/customer-order";
import { fetchOrderDetail, retryOrderPayment } from "@/lib/client-api";
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
  const qrBankId = process.env.NEXT_PUBLIC_VIETQR_BANK_ID;
  const qrAccountNo = process.env.NEXT_PUBLIC_VIETQR_ACCOUNT_NO;
  const qrAccountName = process.env.NEXT_PUBLIC_VIETQR_ACCOUNT_NAME ?? "";
  const transferDescription = order?.paymentCode ?? "";
  const qrUrl = order?.paymentCode && qrBankId && qrAccountNo
    ? `https://vietqr.app/img?${new URLSearchParams({ acc: qrAccountNo, bank: qrBankId, amount: String(order.total), des: transferDescription, template: "compact", showinfo: "true", holder: qrAccountName })}`
    : null;
  const secondsLeft = order ? Math.max(0, Math.ceil((Date.parse(order.expiresAt) - now) / 1000)) : 0;

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

  const handlePayment = async () => {
    if (!order || isProcessing || order.status !== "PAYMENT_FAILED") return;

    setIsProcessing(true);
    setError("");

    try {
      await retryOrderPayment(order.id);
      setOrder(await fetchOrderDetail(order.id, new AbortController().signal));
      setNow(Date.now());
    } catch (err: any) {
      setError(err.message || "Không thể chuẩn bị thanh toán. Hãy thử lại.");
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading) {
    return (
      <section className="container ord-page">
        <LoadingBlock text="Đang tải thông tin đơn hàng" />
      </section>
    );
  }

  if (error || !order) {
    return (
      <section className="container ord-page">
        <ErrorBlock title="Lỗi thanh toán" message={error || "Đơn hàng không hợp lệ"} />
        <Link href="/" className="outline-button">Quay về trang chủ</Link>
      </section>
    );
  }

  return (
    <section className="container ord-page">
      <h1>Thanh toán không tiền mặt</h1>
      <p className="ord-sub">
        Đơn #{order.paymentCode} · {formatVnd(order.total)}
      </p>
      <div className="pay-panel">
        <h2>Chuyển khoản bằng mã QR</h2>

        {error && <p className="pay-note" style={{ color: 'red' }} role="alert">{error}</p>}

        {!order.paymentCode && <p className="pay-note" role="alert">API chưa trả mã thanh toán DH. Khởi động lại backend và tạo đơn mới trước khi hiện QR.</p>}
        {order.paymentCode && !qrUrl && <p className="pay-note">Chưa cấu hình tài khoản nhận tiền VietQR. Cần đặt NEXT_PUBLIC_VIETQR_BANK_ID và NEXT_PUBLIC_VIETQR_ACCOUNT_NO.</p>}

        {secondsLeft === 0 && order.status === "PENDING" && <p className="pay-note" role="status">Đơn và mã QR đã hết hạn. Vui lòng tạo đơn mới.</p>}

        {order.status === "PENDING" && secondsLeft > 0 && qrUrl && (
          <div className="pay-qr">
            <h3>Quét mã QR để chuyển khoản</h3>
            <img className="pay-qr-image" src={qrUrl} alt="Mã QR chuyển khoản VietQR" />
            <p>
              Nội dung chuyển khoản: <strong>{transferDescription}</strong>
            </p>
            <p>Đang chờ SePay xác nhận tiền vào. Quét QR chưa có nghĩa là đã thanh toán.</p>
            <p role="timer">QR còn hiệu lực: {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}</p>
          </div>
        )}
      </div>

      <div className="ord-actions">
        {order.status === "PAYMENT_FAILED" ? (
          <button
            type="button"
            className="primary-button"
            onClick={handlePayment}
            disabled={isProcessing || !qrUrl}
          >
            {isProcessing ? "Đang chuẩn bị..." : `Thử lại thanh toán ${formatVnd(order.total)}`}
          </button>
        ) : (
          <Link className="primary-button" href={`/payment-status?orderId=${encodeURIComponent(order.id)}`}>
            Xem trạng thái thanh toán
          </Link>
        )}
        <Link className="outline-button" href={`/orders/${order.id}`}>
          Xem lại đơn hàng
        </Link>
      </div>
    </section>
  );
}
