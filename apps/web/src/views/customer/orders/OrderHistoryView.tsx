"use client";
// THÀNH VIÊN 6 — Lịch sử đơn. Trang: /orders
// GET /orders/me (JWT của TV3, quyền sở hữu do backend kiểm tra). Có loading/rỗng/lỗi, xem thêm theo trang.
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  describeError,
  fetchMyOrders,
  isAbortError,
  toFailure,
  type LoadFailure,
} from "@/lib/client-api";
import {
  formatDateTime,
  formatVnd,
} from "@/features/orders/order-format";
import {
  FailureBlock,
  LoadingBlock,
  StatusBadge,
} from "@/components/orders/OrderBlocks";
import type { OrderSummary } from "@/types/customer-order";

const PAGE_SIZE = 20;

type State =
  | { kind: "loading" }
  | { kind: "ready"; orders: OrderSummary[]; hasMore: boolean }
  | LoadFailure;

export function OrderHistoryView() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchMyOrders({ limit: PAGE_SIZE, offset: 0 }, controller.signal)
      .then((page) =>
        setState({ kind: "ready", orders: page.orders, hasMore: page.hasMore }),
      )
      .catch((error: unknown) => {
        if (isAbortError(error)) return;
        setState(toFailure(error));
      });
    return () => controller.abort();
  }, [attempt]);

  const reload = () => {
    setState({ kind: "loading" });
    setAttempt((value) => value + 1);
  };

  async function loadMore() {
    if (state.kind !== "ready" || loadingMore) return;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const page = await fetchMyOrders({
        limit: PAGE_SIZE,
        offset: state.orders.length,
      });
      setState((current) => {
        if (current.kind !== "ready") return current;
        const known = new Set(current.orders.map((order) => order.id));
        return {
          kind: "ready",
          orders: [
            ...current.orders,
            ...page.orders.filter((order) => !known.has(order.id)),
          ],
          hasMore: page.hasMore,
        };
      });
    } catch (error) {
      setMoreError(describeError(error));
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <section className="container ord-page">
      <h1>Đơn của tôi</h1>
      <p className="ord-sub">Các đơn bạn đã đặt, mới nhất ở trên cùng.</p>

      {state.kind === "loading" ? (
        <LoadingBlock text="Đang tải đơn hàng" />
      ) : state.kind !== "ready" ? (
        <FailureBlock failure={state} returnTo="/orders" onRetry={reload} />
      ) : state.orders.length === 0 ? (
        <div className="state">
          <h2>Bạn chưa có đơn nào</h2>
          <p>Chọn món yêu thích và đặt đơn đầu tiên nhé.</p>
          <Link className="primary-button" href="/">
            Xem thực đơn
          </Link>
        </div>
      ) : (
        <>
          <ul className="ord-list">
            {state.orders.map((order) => (
              <li key={order.id}>
                <Link
                  className="ord-card"
                  href={`/orders/${encodeURIComponent(order.id)}`}
                >
                  <div>
                     <strong>Đơn #{order.paymentCode}</strong>
                    <div className="ord-meta">
                      {formatDateTime(order.createdAt)} · {order.itemCount} món
                    </div>
                  </div>
                  <div className="ord-card-total">{formatVnd(order.total)}</div>
                  <div>
                    <StatusBadge status={order.status} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          {moreError ? (
            <p className="ord-notice" role="alert">
              {moreError}
            </p>
          ) : null}
          {state.hasMore ? (
            <div className="ord-more">
              <button
                type="button"
                className="outline-button"
                onClick={loadMore}
                disabled={loadingMore}
              >
                {loadingMore ? "Đang tải…" : "Xem thêm"}
              </button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
