"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  cartStore,
  getCartItemKey,
  type CartItem,
} from "@/features/cart/cart.store";
import { apiRequest } from "@/lib/api-client";
import type { Product } from "@/types/product";

const money = new Intl.NumberFormat("vi-VN");
const formatCurrency = (value: number) => `${money.format(value)} đ`;

export function CartView() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const refreshCart = useCallback(() => setItems(cartStore.restoreCart()), []);

  useEffect(() => {
    refreshCart();
    const refresh = () => refreshCart();
    window.addEventListener("storage", refresh);
    window.addEventListener("brewlite:cart-changed", refresh);
    apiRequest<Product[]>("/products")
      .then(setProducts)
      .catch(() => setLoadError("Không tải được giá món. Vui lòng thử lại."))
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
  const updateQuantity = (item: CartItem, quantity: number) => {
    if (quantity < 1) return;
    try {
      setItems(cartStore.updateQuantity(getCartItemKey(item), quantity));
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Không thể cập nhật số lượng.",
      );
    }
  };
  const removeItem = (item: CartItem) =>
    setItems(cartStore.removeItem(getCartItemKey(item)));

  return (
    <section className="container shopping-page">
      <div className="shopping-heading">
        <div>
          <span className="eyebrow">ĐẶT MÓN CỦA BẠN</span>
          <h1>Giỏ hàng</h1>
          <p>Kiểm tra món và tùy chọn trước khi xác nhận.</p>
        </div>
        <Link href="/" className="text-link">
          ← Tiếp tục chọn món
        </Link>
      </div>

      {loadError && (
        <p className="cart-error" role="alert">
          {loadError}
        </p>
      )}
      {loading ? (
        <div className="shopping-state" aria-live="polite">
          Đang tải giỏ hàng…
        </div>
      ) : items.length === 0 ? (
        <div className="shopping-empty">
          <span className="empty-cup" aria-hidden="true">
            ☕
          </span>
          <h2>Giỏ hàng đang trống</h2>
          <p>Chọn một món yêu thích từ thực đơn để bắt đầu.</p>
          <Link href="/" className="primary-button">
            Khám phá thực đơn
          </Link>
        </div>
      ) : (
        <div className="shopping-layout">
          <div className="cart-list" aria-label="Món trong giỏ">
            {items.map((item) => {
              const product = products.find(
                (candidate) => candidate.id === item.productId,
              );
              const size = product?.sizes.find(
                (option) => option.name === item.size,
              );
              const selectedToppings =
                product?.toppings.filter((option) =>
                  item.toppingIds.includes(option.id),
                ) ?? [];
              const unitPrice =
                product && size
                  ? product.price +
                    size.extraPrice +
                    selectedToppings.reduce(
                      (sum, topping) => sum + topping.price,
                      0,
                    )
                  : 0;
              const key = getCartItemKey(item);
              return (
                <article className="cart-item" key={key}>
                  <div className="cart-item-image">
                    {product?.imageUrl ? (
                      <Image src={product.imageUrl} alt="" fill sizes="96px" />
                    ) : (
                      <span aria-hidden="true">☕</span>
                    )}
                  </div>
                  <div className="cart-item-main">
                    <div className="cart-item-title-row">
                      <div>
                        <h2>{product?.name ?? "Món đã ngừng kinh doanh"}</h2>
                        <p className="cart-item-options">
                          Size {item.size}
                          {selectedToppings.length > 0 &&
                            ` · ${selectedToppings.map((topping) => topping.name).join(", ")}`}
                        </p>
                      </div>
                      <strong className="cart-line-total">
                        {formatCurrency(unitPrice * item.quantity)}
                      </strong>
                    </div>
                    {item.note && (
                      <p className="cart-item-note">Ghi chú: {item.note}</p>
                    )}
                    <div className="cart-item-actions">
                      <div
                        className="quantity-control"
                        aria-label={`Số lượng ${product?.name ?? "món"}`}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            updateQuantity(item, item.quantity - 1)
                          }
                          disabled={item.quantity <= 1}
                          aria-label="Giảm số lượng"
                        >
                          −
                        </button>
                        <span aria-live="polite">{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() =>
                            updateQuantity(item, item.quantity + 1)
                          }
                          disabled={item.quantity >= 99}
                          aria-label="Tăng số lượng"
                        >
                          +
                        </button>
                      </div>
                      <span className="cart-unit-price">
                        {formatCurrency(unitPrice)} / món
                      </span>
                      <button
                        className="remove-item"
                        type="button"
                        onClick={() => removeItem(item)}
                      >
                        Xóa
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          <aside className="order-summary">
            <h2>Tóm tắt đơn hàng</h2>
            <div className="summary-row">
              <span>
                {items.reduce((sum, item) => sum + item.quantity, 0)} món
              </span>
              <strong>{formatCurrency(subtotal)}</strong>
            </div>
            <div className="summary-row summary-muted">
              <span>Phí nhận tại quầy</span>
              <span>Miễn phí</span>
            </div>
            <div className="summary-total">
              <span>Tạm tính</span>
              <strong>{formatCurrency(subtotal)}</strong>
            </div>
            <p className="summary-note">
              Giá cuối cùng sẽ được máy chủ xác nhận khi tạo đơn.
            </p>
            {loadError ? (
              <button
                className="primary-button summary-button"
                type="button"
                disabled
              >
                Chưa thể tiếp tục
              </button>
            ) : (
              <Link href="/checkout" className="primary-button summary-button">
                Tiến hành đặt hàng <span aria-hidden="true">→</span>
              </Link>
            )}
            <Link href="/" className="summary-back-link">
              Tiếp tục chọn món
            </Link>
          </aside>
        </div>
      )}
    </section>
  );
}
