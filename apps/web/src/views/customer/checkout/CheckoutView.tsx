"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PromotionInput } from "@/components/promotions/PromotionInput";
import { cartStore, type CartItem } from "@/features/cart/cart.store";
import { authorizedRequest } from "@/features/auth/auth.service";
import { useSession } from "@/features/auth/useSession";
import { ApiError, apiRequest } from "@/lib/api-client";
import type { Product } from "@/types/product";

interface CreatedOrder {
  orderId: string;
  paymentCode: string;
  status: string;
  subtotal: number;
  discount: number;
  total: number;
}

interface PromotionPreview {
  code: string;
  discount: number;
  total: number;
}

const money = new Intl.NumberFormat("vi-VN");
const formatCurrency = (value: number) => `${money.format(value)} đ`;

export function CheckoutView() {
  const session = useSession();
  const [items, setItems] = useState<CartItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [promotionCode, setPromotionCode] = useState("");
  const [promotionPreview, setPromotionPreview] =
    useState<PromotionPreview | null>(null);
  const [promotionError, setPromotionError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [createdOrder, setCreatedOrder] = useState<CreatedOrder | null>(null);

  const refreshCart = useCallback(() => setItems(cartStore.restoreCart()), []);
  useEffect(() => {
    refreshCart();
    const refresh = () => refreshCart();
    window.addEventListener("storage", refresh);
    window.addEventListener("brewlite:cart-changed", refresh);
    apiRequest<Product[]>("/products")
      .then(setProducts)
      .catch(() => setError("Không tải được giá món. Vui lòng tải lại trang."))
      .finally(() => setLoading(false));
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("brewlite:cart-changed", refresh);
    };
  }, [refreshCart]);

  const subtotal = useMemo(
    () => cartStore.calculateSubtotal(products),
    [items, products],
  );
  const unavailable = items.filter(
    (item) => !products.some((product) => product.id === item.productId),
  );
  const discount = promotionPreview?.discount ?? 0;
  const total = promotionPreview?.total ?? subtotal;

  const submitOrder = async () => {
    if (submitting || items.length === 0 || loading || unavailable.length > 0)
      return;
    if (!session) {
      window.location.assign(
        `/login?returnUrl=${encodeURIComponent("/checkout")}`,
      );
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const result = await authorizedRequest<CreatedOrder>("/orders", {
        method: "POST",
        body: {
          items: items.map((item) => ({
            productId: item.productId,
            size: item.size,
            toppingIds: [...item.toppingIds].sort(),
            quantity: item.quantity,
          })),
          ...(promotionCode ? { promotionCode } : {}),
        },
      });
      setCreatedOrder(result);
    } catch (requestError) {
      const message =
        requestError instanceof ApiError
          ? requestError.message
          : "Chưa thể tạo đơn hàng. Vui lòng thử lại.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <section className="container shopping-page">
        <div className="shopping-state" aria-live="polite">
          Đang chuẩn bị xác nhận đơn…
        </div>
      </section>
    );
  }

  if (items.length === 0 && !createdOrder) {
    return (
      <section className="container shopping-page">
        <div className="shopping-heading">
          <div>
            <span className="eyebrow">HOÀN TẤT ĐẶT MÓN</span>
            <h1>Xác nhận đơn</h1>
          </div>
        </div>
        <div className="shopping-empty">
          <span className="empty-cup" aria-hidden="true">
            ☕
          </span>
          <h2>Chưa có món để xác nhận</h2>
          <p>Thêm món vào giỏ hàng rồi quay lại đây nhé.</p>
          <Link href="/" className="primary-button">
            Xem thực đơn
          </Link>
        </div>
      </section>
    );
  }

  if (createdOrder) {
    return (
      <section className="container shopping-page">
        <div className="checkout-success" role="status">
          <span className="success-mark" aria-hidden="true">
            ✓
          </span>
          <span className="eyebrow">ĐƠN HÀNG ĐÃ ĐƯỢC TẠO</span>
          <h1>Đơn của bạn đã sẵn sàng</h1>
          <p className="order-number">
            Mã đơn <strong>{createdOrder.paymentCode}</strong>
          </p>
          <div className="official-total">
            <span>Tổng tiền máy chủ xác nhận</span>
            <strong>{formatCurrency(createdOrder.total)}</strong>
          </div>
          {createdOrder.discount > 0 && (
            <p className="confirmed-discount">
              Đã giảm {formatCurrency(createdOrder.discount)}
              {promotionCode ? ` với mã ${promotionCode}` : ""}.
            </p>
          )}
          <p className="summary-note">
            Giỏ hàng được giữ lại cho tới khi thanh toán thành công.
          </p>
          <Link
            href={`/payment?orderId=${encodeURIComponent(createdOrder.orderId)}`}
            className="primary-button"
          >
            Tiến hành thanh toán <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="container shopping-page">
      <div className="shopping-heading">
        <div>
          <span className="eyebrow">HOÀN TẤT ĐẶT MÓN</span>
          <h1>Xác nhận đơn hàng</h1>
          <p>Đơn hàng sẽ được chuẩn bị để bạn nhận tại quầy.</p>
        </div>
        <Link href="/cart" className="text-link">
          ← Quay lại giỏ hàng
        </Link>
      </div>

      {error && (
        <p className="cart-error" role="alert">
          {error}
        </p>
      )}
      {unavailable.length > 0 && (
        <p className="cart-error" role="alert">
          Một số món không còn trong thực đơn. Hãy quay lại giỏ hàng và xóa các
          món đó.
        </p>
      )}

      <div className="checkout-layout">
        <div className="checkout-main">
          <section className="checkout-card">
            <div className="checkout-section-title">
              <span className="step-number">1</span>
              <div>
                <h2>Thông tin nhận món</h2>
                <p>Đặt trước và nhận món tại quầy BrewLite.</p>
              </div>
            </div>
            <div className="pickup-note">
              <span aria-hidden="true">⌖</span>
              <div>
                <strong>Nhận tại quầy</strong>
                <p>
                  Sau khi thanh toán thành công, nhân viên sẽ chuẩn bị đơn của
                  bạn.
                </p>
              </div>
            </div>
          </section>

          <section className="checkout-card">
            <div className="checkout-section-title">
              <span className="step-number">2</span>
              <div>
                <h2>Kiểm tra món</h2>
                <p>
                  {items.reduce((sum, item) => sum + item.quantity, 0)} món
                  trong giỏ hàng
                </p>
              </div>
            </div>
            <div className="checkout-items">
              {items.map((item) => {
                const product = products.find(
                  (candidate) => candidate.id === item.productId,
                );
                const size = product?.sizes.find(
                  (option) => option.name === item.size,
                );
                const toppings =
                  product?.toppings.filter((option) =>
                    item.toppingIds.includes(option.id),
                  ) ?? [];
                const unitPrice =
                  product && size
                    ? product.price +
                      size.extraPrice +
                      toppings.reduce((sum, topping) => sum + topping.price, 0)
                    : 0;
                return (
                  <article
                    className="checkout-item"
                    key={`${item.productId}-${item.size}-${[...item.toppingIds].sort().join(",")}`}
                  >
                    <div className="checkout-item-image">
                      {product?.imageUrl ? (
                        <Image
                          src={product.imageUrl}
                          alt=""
                          fill
                          sizes="64px"
                        />
                      ) : (
                        <span aria-hidden="true">☕</span>
                      )}
                    </div>
                    <div className="checkout-item-copy">
                      <strong>
                        {product?.name ?? "Món không khả dụng"}{" "}
                        <span>× {item.quantity}</span>
                      </strong>
                      <p>
                        Size {item.size}
                        {toppings.length > 0
                          ? ` · ${toppings.map((topping) => topping.name).join(", ")}`
                          : ""}
                      </p>
                      {item.note && <small>Ghi chú: {item.note}</small>}
                    </div>
                    <strong className="checkout-item-price">
                      {formatCurrency(unitPrice * item.quantity)}
                    </strong>
                  </article>
                );
              })}
            </div>
            <Link href="/cart" className="edit-cart-link">
              Chỉnh sửa giỏ hàng
            </Link>
          </section>

          <div className="checkout-promotion">
            <PromotionInput
              subtotal={subtotal}
              discount={discount}
              total={total}
              appliedCode={promotionCode || undefined}
              error={promotionError || undefined}
              onApplyCode={async (code) => {
                try {
                  const preview =
                    await authorizedRequest<PromotionPreview>(
                      "/orders/validate-promotion",
                      {
                    method: "POST",
                    body: { code, subtotal },
                      },
                    );
                  setPromotionCode(code);
                  setPromotionPreview(preview);
                  setPromotionError("");
                  setError("");
                } catch (requestError) {
                  setPromotionCode("");
                  setPromotionPreview(null);
                  setPromotionError(
                    requestError instanceof ApiError
                      ? requestError.message
                      : "Mã khuyến mãi không hợp lệ.",
                  );
                }
              }}
              onClearPromotion={() => {
                setPromotionCode("");
                setPromotionPreview(null);
                setPromotionError("");
              }}
            />
            <p className="promotion-disclaimer">
              Mã sẽ được máy chủ kiểm tra khi tạo đơn. Mức giảm chính thức hiển
              thị sau khi đơn được tạo.
            </p>
          </div>
        </div>

        <aside className="order-summary checkout-summary">
          <h2>Tổng kết đơn hàng</h2>
          <div className="summary-row">
            <span>Tạm tính</span>
            <strong>{formatCurrency(subtotal)}</strong>
          </div>
          <div className="summary-row summary-muted">
            <span>Nhận tại quầy</span>
            <span>Miễn phí</span>
          </div>
          <div className="summary-total">
            <span>Tổng tạm tính</span>
            <strong>{formatCurrency(total)}</strong>
          </div>
          <p className="summary-note">
            Giá có thể thay đổi theo dữ liệu mới nhất. Máy chủ sẽ tính lại giá
            và tồn kho trước khi tạo đơn.
          </p>
          {!session && (
            <p className="login-reminder">
              Bạn cần đăng nhập để đặt hàng. Giỏ hàng sẽ được giữ nguyên khi
              quay lại.
            </p>
          )}
          <button
            className="primary-button summary-button"
            type="button"
            onClick={submitOrder}
            disabled={submitting || unavailable.length > 0}
          >
            {submitting
              ? "Đang tạo đơn…"
              : session
                ? "Xác nhận đặt hàng"
                : "Đăng nhập để tiếp tục"}
            {!submitting && <span aria-hidden="true">→</span>}
          </button>
          {!session && (
            <Link
              className="checkout-register-link"
              href="/register?returnUrl=%2Fcheckout"
            >
              Chưa có tài khoản? Đăng ký
            </Link>
          )}
          <p className="checkout-terms">
            Bằng cách đặt hàng, bạn đồng ý để BrewLite xử lý đơn theo thông tin
            đã xác nhận.
          </p>
        </aside>
      </div>
    </section>
  );
}
