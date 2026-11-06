"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { cartStore } from "@/features/cart/cart.store";
import { Product } from "@/types/product";
import { ApiError, apiRequest } from "@/lib/api-client";

interface ProductDetailViewProps {
  product: Product;
}

export function ProductDetailView({ product }: ProductDetailViewProps) {
  const [selectedSize, setSelectedSize] = useState<string>(
    product.sizes?.[0]?.name ?? "M",
  );
  // phần note này chỉ hiển thị cho nhân viên, không ảnh hưởng đến giá hay giỏ hàng.
  const [note, setNote] = useState<string>("");
  const [selectedToppings, setSelectedToppings] = useState<string[]>([]);
  const [imageFailed, setImageFailed] = useState(false);
  const [toast, setToast] = useState<{
    show: boolean;
    message: string;
    details: string;
    canViewCart: boolean;
  } | null>(null);

  // Tính giá hiển thị dựa trên size và topping
  const sizeExtra =
    product.sizes?.find((s) => s.name === selectedSize)?.extraPrice ?? 0;
  const toppingsExtra = (product.toppings ?? [])
    .filter((t) => selectedToppings.includes(t.id))
    .reduce((sum, t) => sum + t.price, 0);
  const displayPrice = product.price + sizeExtra + toppingsExtra;

  const toggleTopping = (toppingId: string) => {
    setSelectedToppings((prev) =>
      prev.includes(toppingId)
        ? prev.filter((id) => id !== toppingId)
        : [...prev, toppingId],
    );
  };

  const handleAddToCart = async () => {
    const cartItem = {
      productId: product.id,
      size: selectedSize,
      toppingIds: selectedToppings,
      quantity: 1,
      note: note.trim(),
    };
    try {
      await apiRequest(`/products/${encodeURIComponent(product.id)}/check-stock`, {
        method: "POST",
        body: { size: selectedSize, toppingIds: selectedToppings },
      });
      cartStore.addItem(cartItem);
    } catch (error) {
      setToast({
        show: true,
        message:
          error instanceof ApiError
            ? error.message === "Sản phẩm hoặc topping chưa có công thức nguyên liệu"
              ? error.message
              : "Nguyên liệu không đủ"
            : "Nguyên liệu món này không đủ.",
        details: "Vui lòng chọn món hoặc topping khác.",
        canViewCart: false,
      });
      return;
    }

    const toppingNames = (product.toppings ?? [])
      .filter((t) => selectedToppings.includes(t.id))
      .map((t) => t.name)
      .join(", ");

    const details = `Size ${selectedSize}${
      toppingNames ? ` • Topping: ${toppingNames}` : ""
    } • ${new Intl.NumberFormat("vi-VN").format(displayPrice)} đ`;

    setToast({
      show: true,
      message: `Đã thêm ${product.name} vào giỏ hàng!`,
      details,
      canViewCart: true,
    });

    // Tự động đóng sau 4 giây
    setTimeout(() => {
      setToast(null);
    }, 4000);
    setNote("");
  };

  return (
    <div className="container">
      {toast?.show && (
        <div className="alert toast-notification" role="status">
          <div className="toast-icon">{toast.canViewCart ? "✓" : "!"}</div>
          <div className="toast-body">
            <h4 className="toast-title">{toast.message}</h4>
            <p className="toast-desc">{toast.details}</p>
          </div>
          <div className="toast-actions">
            {toast.canViewCart && (
              <Link href="/cart" className="toast-cart-btn">
                Xem giỏ hàng
              </Link>
            )}
            <button
              type="button"
              className="toast-close-btn"
              onClick={() => setToast(null)}
              aria-label="Đóng thông báo"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <Link href="/" className="back-link">
        ← Quay lại thực đơn
      </Link>

      <div className="product-detail-layout">
        {/* Khung ảnh đồ uống */}
        <div className="product-detail-image-box">
          {product.badge && <span className="badge">{product.badge}</span>}
          {product.imageUrl && !imageFailed ? (
            <Image
              src={product.imageUrl}
              alt={product.name}
              fill
              className="product-photo"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <span className="photo-placeholder" aria-hidden="true">
              Chưa có ảnh món
            </span>
          )}
        </div>

        {/* Thông tin & Tùy chọn */}
        <div className="product-detail-info">
          <span className="product-detail-category">{product.category}</span>
          <h1 className="product-detail-title">{product.name}</h1>
          <p className="product-detail-desc">{product.description}</p>

          <div className="product-detail-price">
            {new Intl.NumberFormat("vi-VN").format(displayPrice)}{" "}
            <small>đ</small>
          </div>

          {/* Chọn Size */}
          {product.sizes && product.sizes.length > 0 && (
            <div className="option-group">
              <label className="option-label">Chọn kích cỡ (Size):</label>
              <div className="size-selector">
                {product.sizes.map((s) => (
                  <button
                    key={s.name}
                    type="button"
                    onClick={() => setSelectedSize(s.name)}
                    className={`size-button ${
                      selectedSize === s.name ? "active" : ""
                    }`}
                  >
                    Size {s.name}{" "}
                    {s.extraPrice > 0
                      ? `(+${s.extraPrice.toLocaleString("vi-VN")}đ)`
                      : ""}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Chọn Topping */}
          {product.toppings && product.toppings.length > 0 && (
            <div className="option-group">
              <label className="option-label">Thêm Topping:</label>
              <div className="toppings-list">
                {product.toppings.map((t) => (
                  <label key={t.id} className="topping-item">
                    <input
                      type="checkbox"
                      checked={selectedToppings.includes(t.id)}
                      onChange={() => toggleTopping(t.id)}
                    />
                    <span>{t.name}</span>
                    <span className="topping-price">
                      (+{t.price.toLocaleString("vi-VN")}đ)
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
          {/*Ghi chí cho nhân viên */}
          <div className="option-group">
            <label className="option-label">Ghi chú:</label>
            <textarea
              className="option-textarea"
              placeholder="Ghi yêu cầu của bạn tại đây..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          {/* Nút thêm vào giỏ */}
          <button
            type="button"
            className="primary-button add-to-cart-btn"
            onClick={handleAddToCart}
          >
            Thêm vào giỏ hàng •{" "}
            {new Intl.NumberFormat("vi-VN").format(displayPrice)} đ
          </button>
        </div>
      </div>
    </div>
  );
}
