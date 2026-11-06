"use client";

import { FormEvent, useEffect, useState } from "react";

interface PromotionInputProps {
  subtotal: number;
  discount: number;
  total: number;
  appliedCode?: string;
  error?: string;
  isApplying?: boolean;
  onApplyCode: (code: string) => void | Promise<void>;
  onClearPromotion: () => void;
}

const currencyFormatter = new Intl.NumberFormat("vi-VN");

function formatCurrency(value: number) {
  return `${currencyFormatter.format(value)} đ`;
}

export function PromotionInput({
  subtotal,
  discount,
  total,
  appliedCode,
  error,
  isApplying = false,
  onApplyCode,
  onClearPromotion,
}: PromotionInputProps) {
  const [code, setCode] = useState(appliedCode ?? "");
  const [inputError, setInputError] = useState<string>();

  useEffect(() => {
    setCode(appliedCode ?? "");
  }, [appliedCode]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedCode = code.trim().toUpperCase();
    if (!normalizedCode) {
      setInputError("Vui lòng nhập mã khuyến mãi.");
      return;
    }

    setInputError(undefined);
    onApplyCode(normalizedCode);
  };

  const handleClear = () => {
    setCode("");
    setInputError(undefined);
    onClearPromotion();
  };

  const message = inputError ?? error;

  return (
    <section className="promotion-input" aria-labelledby="promotion-title">
      <h2 id="promotion-title">Mã khuyến mãi</h2>
      <form className="promotion-form" onSubmit={handleSubmit}>
        <label className="sr-only" htmlFor="promotion-code">
          Mã khuyến mãi
        </label>
        <input
          id="promotion-code"
          type="text"
          value={code}
          placeholder="Nhập mã khuyến mãi"
          autoComplete="off"
          onChange={(event) => {
            setCode(event.target.value);
            setInputError(undefined);
          }}
          disabled={isApplying}
        />
        <button type="submit" disabled={isApplying}>
          {isApplying ? "Đang kiểm tra..." : "Áp dụng"}
        </button>
      </form>

      {message && (
        <p className="promotion-error" role="alert">
          {message}
        </p>
      )}

      {appliedCode && (
        <div className="promotion-applied">
          <span>
            Đã áp dụng mã <strong>{appliedCode}</strong>
          </span>
          <button type="button" onClick={handleClear} disabled={isApplying}>
            Xóa mã
          </button>
        </div>
      )}

      <dl className="promotion-summary">
        <div>
          <dt>Tạm tính</dt>
          <dd>{formatCurrency(subtotal)}</dd>
        </div>
        <div>
          <dt>Giảm giá</dt>
          <dd>-{formatCurrency(discount)}</dd>
        </div>
        <div className="promotion-total">
          <dt>Thành tiền</dt>
          <dd>{formatCurrency(total)}</dd>
        </div>
      </dl>
    </section>
  );
}
