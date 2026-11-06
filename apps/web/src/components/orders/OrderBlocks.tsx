// TV6 — Thành phần nhỏ dùng chung cho các trang đơn hàng. Dùng lại class .state/.primary-button của TV1.
import Link from "next/link";
import { STATUS_LABEL, STATUS_TONE } from "@/features/orders/order-format";
import type { LoadFailure } from "@/lib/client-api";
import type { OrderStatus } from "@/types/customer-order";
import "./orders.css";

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={`ord-badge ord-badge-${STATUS_TONE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function LoadingBlock({ text }: { text: string }) {
  return (
    <div className="state" role="status" aria-live="polite" aria-busy="true">
      <h2>{text}</h2>
      <p>Vui lòng chờ trong giây lát…</p>
    </div>
  );
}

/** Chưa đăng nhập / phiên hết hạn. returnTo luôn là đường dẫn nội bộ do chính trang này dựng. */
export function LoginPrompt({ returnTo }: { returnTo: string }) {
  return (
    <div className="state" role="alert">
      <h2>Bạn cần đăng nhập</h2>
      <p>Đăng nhập để xem đơn hàng của bạn. Giỏ hàng vẫn được giữ nguyên.</p>
      {/* TV3: /login xác thực returnUrl là đường dẫn nội bộ trước khi chuyển hướng. */}
      <Link
        className="primary-button"
        href={`/login?returnUrl=${encodeURIComponent(returnTo)}`}
      >
        Đăng nhập
      </Link>
    </div>
  );
}

export function ErrorBlock({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="state" role="alert">
      <h2>{title}</h2>
      <p>{message}</p>
      {onRetry ? (
        <button type="button" className="primary-button" onClick={onRetry}>
          Thử lại
        </button>
      ) : null}
    </div>
  );
}

export function NotFoundBlock() {
  return (
    <div className="state" role="alert">
      <h2>Không tìm thấy đơn hàng</h2>
      <p>Đơn không tồn tại hoặc không thuộc tài khoản của bạn.</p>
      <Link className="primary-button" href="/orders">
        Về đơn của tôi
      </Link>
    </div>
  );
}

/** Dựng khối thích hợp cho các lỗi tải dữ liệu chung. */
export function FailureBlock({
  failure,
  returnTo,
  onRetry,
}: {
  failure: LoadFailure;
  returnTo: string;
  onRetry: () => void;
}) {
  if (failure.kind === "unauthorized")
    return <LoginPrompt returnTo={returnTo} />;
  if (failure.kind === "notfound") return <NotFoundBlock />;
  return (
    <ErrorBlock
      title="Chưa tải được dữ liệu"
      message={failure.message}
      onRetry={onRetry}
    />
  );
}
