"use client";
// THÀNH VIÊN 6 — Kết quả thanh toán. Trang: /payment-status?orderId=<mã đơn>
// TV5 điều hướng sang đây kèm orderId. Kết quả lấy từ backend (GET /orders/:id, gồm trạng thái đơn + các lần thanh toán),
// KHÔNG tin tham số status trên URL. Chỉ xóa giỏ khi backend xác nhận đơn đã trả tiền (đúng một lần).
// Timeout/mất mạng không bị coi là thất bại: đơn và tồn vẫn được giữ, khách có thể kiểm tra lại.
// Luồng SePay: tiền về qua webhook nên đơn có thể còn PENDING (chưa có giao dịch) một lúc; trang vẫn chờ chứ không báo "chưa thanh toán" ngay.
import { Suspense, useEffect, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { usePaymentOutcome } from "@/features/orders/use-payment-outcome";
import { formatVnd } from "@/features/orders/order-format";
import { CartStore } from "@/features/cart/cart.store";
import { FailureBlock, LoadingBlock } from "@/components/orders/OrderBlocks";
import "@/components/orders/orders.css";

// Chỉ gọi khi kết quả chính thức là PAID. CartStore (TV2) lưu giỏ ở localStorage và tự báo cho header cập nhật,
// nên dùng instance mới vẫn xóa đúng giỏ. Lỗi chỉ ghi log, không làm hỏng trang kết quả.
function clearCartAfterPayment() {
  try {
    new CartStore().clearAfterPayment();
  } catch (error) {
    console.warn("Chưa xóa được giỏ hàng sau thanh toán:", error);
  }
}

export function PaymentStatusView() {
  // useSearchParams cần Suspense để `next build` không lỗi khi prerender.
  return (
    <Suspense fallback={<LoadingBlock text="Đang kiểm tra kết quả" />}>
      <PaymentStatusContent />
    </Suspense>
  );
}

function PaymentStatusContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId");
  const { state, restart } = usePaymentOutcome(orderId);
  const cleared = useRef(false);

  const paid = state.kind === "ready" && state.outcome === "SUCCESS";
  useEffect(() => {
    if (paid && !cleared.current) {
      cleared.current = true;
      clearCartAfterPayment();
    }
  }, [paid]);

  if (!orderId) {
    return (
      <section className="container ord-page">
        <div className="state" role="alert">
          <h2>Thiếu mã đơn hàng</h2>
          <p>Không xác định được đơn cần kiểm tra thanh toán.</p>
          <Link className="primary-button" href="/orders">
            Xem đơn của tôi
          </Link>
        </div>
      </section>
    );
  }

  const detailHref = `/orders/${encodeURIComponent(orderId)}`;
  const payHref = `/payment?orderId=${encodeURIComponent(orderId)}`; // trang của TV5

  if (state.kind === "loading") {
    return (
      <section className="container ord-page">
        <LoadingBlock text="Đang kiểm tra kết quả thanh toán" />
      </section>
    );
  }
  if (state.kind !== "ready") {
    return (
      <section className="container ord-page">
        <FailureBlock
          failure={state}
          returnTo={`/payment-status?orderId=${encodeURIComponent(orderId)}`}
          onRetry={restart}
        />
      </section>
    );
  }

  const { order, outcome, timedOut } = state;
  return (
    <section className="container ord-page">
      <div className="ord-result" role="status" aria-live="polite">
        {outcome === "SUCCESS" ? (
          <>
            <h1>Thanh toán thành công</h1>
            <p>
               Đơn #{order.paymentCode} · {formatVnd(order.total)}
            </p>
            {order.pointsEarned !== null ? (
              <p>Bạn nhận được +{order.pointsEarned} điểm thưởng.</p>
            ) : null}
            <p>Ghé quầy nhận nước khi đơn sẵn sàng nhé.</p>
            <div className="ord-actions">
              <Link className="primary-button" href={detailHref}>
                Xem đơn
              </Link>
              <Link className="outline-button" href="/">
                Về thực đơn
              </Link>
            </div>
          </>
        ) : outcome === "PROCESSING" ? (
          <>
            <h1>Đang xử lý thanh toán</h1>
            {timedOut ? (
              <>
                <p>
                  Giao dịch vẫn đang được xác nhận. Đơn và món của bạn vẫn được
                  giữ, vui lòng không thanh toán lại.
                </p>
                <div className="ord-actions">
                  <button
                    type="button"
                    className="primary-button"
                    onClick={restart}
                  >
                    Kiểm tra lại
                  </button>
                  <Link className="outline-button" href={detailHref}>
                    Xem đơn
                  </Link>
                </div>
              </>
            ) : (
              <p>Vui lòng chờ trong giây lát và không đóng trang này…</p>
            )}
          </>
        ) : outcome === "FAILED" ? (
          <>
            <h1>Thanh toán không thành công</h1>
            <p>Giỏ hàng của bạn vẫn được giữ nguyên.</p>
            <div className="ord-actions">
              {order.canRetryPayment ? (
                <Link className="primary-button" href={payHref}>
                  Thử thanh toán lại
                </Link>
              ) : null}
              <Link className="outline-button" href={detailHref}>
                Xem đơn
              </Link>
            </div>
          </>
        ) : outcome === "CANCELLED" ? (
          <>
            <h1>Đơn đã bị hủy</h1>
            <p>Đơn này không còn hiệu lực nên không thể thanh toán.</p>
            <div className="ord-actions">
              <Link className="primary-button" href="/">
                Về thực đơn
              </Link>
              <Link className="outline-button" href="/orders">
                Đơn của tôi
              </Link>
            </div>
          </>
        ) : timedOut ? (
          <>
            <h1>Chưa nhận được thanh toán</h1>
            <p>
              Hệ thống chưa thấy giao dịch cho đơn này. Nếu bạn đã chuyển khoản,
              vui lòng chờ thêm rồi bấm “Kiểm tra lại” và không chuyển tiền lần
              nữa.
            </p>
            <div className="ord-actions">
              <button
                type="button"
                className="primary-button"
                onClick={restart}
              >
                Kiểm tra lại
              </button>
              <Link className="outline-button" href={detailHref}>
                Xem đơn
              </Link>
              <Link className="outline-button" href={payHref}>
                Trang thanh toán
              </Link>
            </div>
          </>
        ) : (
          <>
            <h1>Đang chờ xác nhận thanh toán</h1>
            <p>
              Đang chờ ngân hàng xác nhận chuyển khoản. Vui lòng không đóng
              trang này và không chuyển tiền lần nữa…
            </p>
            {new Date(order.expiresAt).getTime() > Date.now() && (
              <div className="ord-actions">
                <Link className="primary-button" href={payHref}>
                  Xem mã QR thanh toán
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
