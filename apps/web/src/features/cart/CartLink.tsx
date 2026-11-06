"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cartStore } from "./cart.store";

export function CartLink() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const update = () =>
      setCount(
        cartStore.restoreCart().reduce((sum, item) => sum + item.quantity, 0),
      );
    update();
    window.addEventListener("storage", update);
    window.addEventListener("brewlite:cart-changed", update);
    return () => {
      window.removeEventListener("storage", update);
      window.removeEventListener("brewlite:cart-changed", update);
    };
  }, []);

  return (
    <Link
      href="/cart"
      className="cart-link"
      aria-label={`Giỏ hàng, ${count} món`}
    >
      Giỏ hàng{" "}
      <span className="cart-count" aria-live="polite">
        {count}
      </span>
    </Link>
  );
}
