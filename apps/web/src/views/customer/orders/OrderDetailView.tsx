"use client";
// THÀNH VIÊN 6 — Chi tiết đơn. Trang: /orders/[id]
// GET /orders/:id (chỉ đơn của mình). Nút hủy gọi POST /orders/:id/cancel của TV4, rồi LUÔN tải lại trạng thái thật;
// không tự đổi trạng thái/hoàn tồn ở UI. Backend trả 409 thì hiện thông báo và trạng thái mới.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ApiError,
  cancelOrder,
  describeError,
  fetchOrderDetail,
  isAbortError,
  toFailure,
  type LoadFailure,
} from "@/lib/client-api";
import {
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
  formatDateTime,
  formatVnd,
  humanizeId,
} from "@/features/orders/order-format";
import {
  FailureBlock,
  LoadingBlock,
  NotFoundBlock,
  StatusBadge,
} from "@/components/orders/OrderBlocks";
import type { OrderDetail } from "@/types/customer-order";

type State =
  { kind: "loading" } | { kind: "ready"; order: OrderDetail } | LoadFailure;

type CancelState = {
  step: "idle" | "confirm" | "sending";
  message: string | null;
};

function readOrderId(raw: string | string[] | undefined): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

export function OrderDetailView() {
  const params = useParams<{ id?: string | string[] }>();
  const orderId = readOrderId(params?.id);
  const [state, setState] = useState<State>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [cancel, setCancel] = useState<CancelState>({
    step: "idle",
    message: null,
  });

  useEffect(() => {
    if (!orderId) return;
    const controller = new AbortController();
    fetchOrderDetail(orderId, controller.signal)
      .then((order) => setState({ kind: "ready", order }))
      .catch((error: unknown) => {
        if (isAbortError(error)) return;
        setState(toFailure(error));
      });
    return () => controller.abort();
  }, [orderId, attempt]);

  const reload = () => {
    setState({ kind: "loading" });
    setAttempt((value) => value + 1);
  };

  async function confirmCancel() {
    if (!orderId || cancel.step === "sending") return; // chống bấm đúp
    setCancel({ step: "sending", message: null });
    try {
      await cancelOrder(orderId);
      setCancel({
        step: "idle",
        message: "Đã gửi yêu cầu hủy. Trạng thái đơn được cập nhật bên dưới.",
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setCancel({ step: "idle", message: null });
        setState({ kind: "unauthorized" });
        return;
      }
      // 409: đơn vừa đổi trạng thái (ví dụ đang thanh toán) — hiện lý do rồi tải lại bên dưới.
      setCancel({ step: "idle", message: describeError(error) });
    }
    setAttempt((value) => value + 1); // giữ đơn cũ trên màn hình cho tới khi có dữ liệu mới
  }

  if (!orderId) return <NotFoundBlock />;
  const returnTo = `/orders/${encodeURIComponent(orderId)}`;

  return (
    <section className="container ord-page">
      <p className="ord-meta">
        <Link href="/orders">← Đơn của tôi</Link>
      </p>

      {state.kind === "loading" ? (
        <LoadingBlock text="Đang tải chi tiết đơn" />
      ) : state.kind !== "ready" ? (
        <FailureBlock failure={state} returnTo={returnTo} onRetry={reload} />
      ) : (
        <OrderBody
          order={state.order}
          cancel={cancel}
          onAskCancel={() => setCancel({ step: "confirm", message: null })}
          onKeep={() => setCancel({ step: "idle", message: null })}
          onConfirmCancel={confirmCancel}
          orderId={orderId}
        />
      )}
    </section>
  );
}

function OrderBody({
  order,
  orderId,
  cancel,
  onAskCancel,
  onKeep,
  onConfirmCancel,
}: {
  order: OrderDetail;
  orderId: string;
  cancel: CancelState;
  onAskCancel: () => void;
  onKeep: () => void;
  onConfirmCancel: () => void;
}) {
  const payHref = `/payment?orderId=${encodeURIComponent(orderId)}`; // trang của TV5
  return (
    <>
       <h1>Đơn #{order.paymentCode}</h1>
      <p className="ord-sub">
        <StatusBadge status={order.status} /> · đặt lúc{" "}
        {formatDateTime(order.createdAt)}
      </p>

      {order.status === "PENDING" ? (
        <p className="ord-notice">
          Đơn được giữ đến {formatDateTime(order.expiresAt)}. Quá hạn mà chưa
          thanh toán, đơn sẽ tự hủy.
        </p>
      ) : null}
      {cancel.message ? (
        <p className="ord-notice" role="status" aria-live="polite">
          {cancel.message}
        </p>
      ) : null}

      <div className="ord-section">
        <h2>Món đã đặt</h2>
        <ul className="ord-lines">
          {order.items.map((item) => (
            <li key={item.id} className="ord-line">
              <span>
                {item.quantity} × {item.productName} (size {item.size})
              </span>
              <span>{formatVnd(item.lineTotal)}</span>
              {item.toppingIds.length > 0 ? (
                <small className="ord-meta">
                  Topping: {item.toppingIds.map(humanizeId).join(", ")}
                </small>
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      <div className="ord-section ord-sum">
        <div>
          <span>Tạm tính</span>
          <span>{formatVnd(order.subtotal)}</span>
        </div>
        {order.discount > 0 ? (
          <div>
            <span>
              Giảm giá{order.promotionCode ? ` (${order.promotionCode})` : ""}
            </span>
            <span>−{formatVnd(order.discount)}</span>
          </div>
        ) : null}
        <div className="ord-total">
          <span>Tổng cộng</span>
          <span>{formatVnd(order.total)}</span>
        </div>
        {order.pointsEarned !== null ? (
          <div>
            <span>Điểm thưởng nhận được</span>
            <span>+{order.pointsEarned}</span>
          </div>
        ) : null}
      </div>

      {order.payments.length > 0 ? (
        <div className="ord-section">
          <h2>Lịch sử thanh toán</h2>
          <ul className="ord-lines">
            {order.payments.map((payment) => (
              <li key={payment.id} className="ord-line">
                <span>
                  {PAYMENT_METHOD_LABEL[payment.method]} ·{" "}
                  {PAYMENT_STATUS_LABEL[payment.status]}
                </span>
                <span>{formatVnd(payment.amount)}</span>
                <small className="ord-meta">
                  {formatDateTime(payment.createdAt)}
                </small>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="ord-actions">
        {order.status === "PENDING" ? (
          <Link className="primary-button" href={payHref}>
            Thanh toán
          </Link>
        ) : null}
        {order.canRetryPayment ? (
          <Link className="primary-button" href={payHref}>
            Thử thanh toán lại
          </Link>
        ) : null}
        {order.canCancel && cancel.step === "idle" ? (
          <button
            type="button"
            className="outline-button ord-danger"
            onClick={onAskCancel}
          >
            Hủy đơn
          </button>
        ) : null}
      </div>

      {order.canCancel && cancel.step !== "idle" ? (
        <div
          className="ord-notice"
          role="alertdialog"
          aria-label="Xác nhận hủy đơn"
        >
          <p>Bạn chắc chắn muốn hủy đơn này? Thao tác không thể hoàn tác.</p>
          <div className="ord-actions">
            <button
              type="button"
              className="outline-button ord-danger"
              onClick={onConfirmCancel}
              disabled={cancel.step === "sending"}
            >
              {cancel.step === "sending" ? "Đang hủy…" : "Xác nhận hủy"}
            </button>
            <button
              type="button"
              className="outline-button"
              onClick={onKeep}
              disabled={cancel.step === "sending"}
            >
              Giữ đơn
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
