"use client";
// TV6 — pollPaymentStatus / stopPolling / checkPaymentStatus gom thành một hook.
// Đọc đơn từ GET /orders/:id (backend TV6, đã kèm các lần thanh toán + trạng thái đơn) nên không tin status trên URL.
// Tiếp tục hỏi khi attempt đang PROCESSING HOẶC đơn còn PENDING chưa có giao dịch (chờ webhook SePay báo tiền về).
// Dừng khi có kết quả cuối, khi hết thời gian chờ, hoặc khi component unmount.
import { useEffect, useState } from "react";
import {
  ApiError,
  fetchOrderDetail,
  isAbortError,
  reconcilePayment,
  toFailure,
  type LoadFailure,
} from "@/lib/client-api";
import {
  derivePaymentOutcome,
  isStillWaiting,
  type PaymentOutcome,
} from "@/features/orders/order-format";
import type { OrderDetail } from "@/types/customer-order";

const INTERVAL_MS = 2000;
const MAX_WAIT_MS = 60_000;
const MAX_CONSECUTIVE_FAILURES = 3;

export type PaymentOutcomeState =
  | { kind: "loading" }
  | {
      kind: "ready";
      order: OrderDetail;
      outcome: PaymentOutcome;
      /** true khi hết thời gian chờ mà vẫn PROCESSING / chưa thấy tiền: đơn/tồn vẫn được giữ, khách bấm kiểm tra lại. */
      timedOut: boolean;
    }
  | LoadFailure;

export function usePaymentOutcome(orderId: string | null) {
  const [state, setState] = useState<PaymentOutcomeState>({ kind: "loading" });
  const [round, setRound] = useState(0);

  useEffect(() => {
    if (!orderId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();
    let failures = 0;

    const tick = async () => {
      try {
        let order = await fetchOrderDetail(orderId, controller.signal);
        if (controller.signal.aborted) return;
        const latestPayment = order.payments[0];
        if (latestPayment?.status === "PROCESSING") {
          await reconcilePayment(latestPayment.id);
          if (controller.signal.aborted) return;
          order = await fetchOrderDetail(orderId, controller.signal);
          if (controller.signal.aborted) return;
        }
        failures = 0;
        const outcome = derivePaymentOutcome(order);
        if (!isStillWaiting(outcome)) {
          setState({ kind: "ready", order, outcome, timedOut: false });
          return; // kết quả cuối: dừng polling
        }
        const timedOut = Date.now() - startedAt >= MAX_WAIT_MS;
        setState({ kind: "ready", order, outcome, timedOut });
        if (!timedOut) timer = setTimeout(tick, INTERVAL_MS);
      } catch (error) {
        if (isAbortError(error) || controller.signal.aborted) return;
        const permanent =
          error instanceof ApiError &&
          (error.status === 401 || error.status === 404);
        failures += 1;
        if (permanent || failures >= MAX_CONSECUTIVE_FAILURES) {
          setState(toFailure(error)); // lỗi mạng KHÔNG được hiểu là thanh toán thất bại
          return;
        }
        timer = setTimeout(tick, INTERVAL_MS);
      }
    };
    void tick();

    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [orderId, round]);

  /** Nút "Kiểm tra lại": chạy lại một vòng polling. */
  const restart = () => {
    setState({ kind: "loading" });
    setRound((value) => value + 1);
  };

  return { state, restart };
}
