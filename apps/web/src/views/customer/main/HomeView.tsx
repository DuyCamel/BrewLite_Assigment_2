"use client";
// TV1 — Trang chính đã hoạt động: menu, tìm kiếm, lọc nhóm. Ảnh để trống theo yêu cầu.
import { useMemo, useState } from "react";
import Link from "next/link";
import { Product } from "@/types/product";
import { ProductCard } from "@/components/products/ProductCard";
const categories = ["Tất cả", "Cà phê", "Trà trái cây", "Matcha", "Khác"];

export function HomeView({
  products,
  loadError = false,
}: {
  products: Product[];
  loadError?: boolean;
}) {
  const [category, setCategory] = useState("Tất cả");
  const [search, setSearch] = useState("");
  const visible = useMemo(
    () =>
      products.filter(
        (p) =>
          (category === "Tất cả" || p.category === category) &&
          p.name
            .toLocaleLowerCase("vi")
            .includes(search.trim().toLocaleLowerCase("vi")),
      ),
    [products, category, search],
  );
  return (
    <>
      <section className="hero">
        <div className="container hero-inner">
          <div className="hero-copy">
            <div className="eyebrow">
              <span /> PHA CHÚT VUI CHO NGÀY MỚI
            </div>
            <h1>
              Món quen của bạn.
              <br />
              <em>Một chạm là có.</em>
            </h1>
            <p>
              Cà phê đậm vị, trà thanh mát. Chọn món bạn thích,
              <br className="desktop-break" /> đặt trước và ghé quầy nhận ngay.
            </p>
            <a href="#menu" className="primary-button">
              Khám phá thực đơn <span aria-hidden="true">↗</span>
            </a>
            <div className="hero-note">
              <span aria-hidden="true">✓</span> Đặt trước tiện lợi{" "}
              <span aria-hidden="true">·</span> Thanh toán không tiền mặt
            </div>
          </div>
          <div
            className="hero-visual"
            aria-label="Vùng ảnh đồ uống đang để trống"
          >
            <div className="visual-caption">
              <span>YOUR DAILY LITTLE JOY</span>
              <strong>
                Brewed
                <br />
                for you.
              </strong>
            </div>
            <div className="hero-photo-frame">
              <img src="/images/products/logo_main.png" alt="Ảnh đồ uống" />
            </div>
            <div className="visual-bottom">
              FRESHLY MADE <span>WITH LOVE, ALWAYS.</span>
            </div>
          </div>
        </div>
      </section>
      <section className="service-strip">
        <div className="container">
          <span>
            01 <strong>Chọn món yêu thích</strong>
          </span>
          <span>
            02 <strong>Đặt & thanh toán</strong>
          </span>
          <span>
            03 <strong>Ghé quầy nhận nước</strong>
          </span>
        </div>
      </section>
      <section id="menu" className="container menu-section">
        <div className="menu-heading">
          <div>
            <div className="eyebrow">THỰC ĐƠN BREWLITE</div>
            <h2>Hôm nay, bạn uống gì?</h2>
            <p>Một lựa chọn nhỏ cho ngày thêm dễ chịu.</p>
          </div>
          <label className="search">
            <span aria-hidden="true">⌕</span>
            <input
              aria-label="Tìm đồ uống"
              placeholder="Tìm món bạn thích…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>
        <div className="menu-toolbar">
          <div
            className="categories"
            role="group"
            aria-label="Lọc loại đồ uống"
          >
            {categories.map((c) => (
              <button
                key={c}
                aria-pressed={c === category}
                className={c === category ? "active" : ""}
                onClick={() => setCategory(c)}
              >
                {c}
              </button>
            ))}
          </div>
          <span className="result-count" aria-live="polite">
            {visible.length} món dành cho bạn
          </span>
        </div>
        {loadError ? (
          <div className="state" role="alert">
            <h3>Chưa tải được thực đơn</h3>
            <p>Vui lòng thử lại sau ít phút.</p>
            <button
              className="primary-button"
              onClick={() => window.location.reload()}
            >
              Thử lại
            </button>
          </div>
        ) : visible.length === 0 ? (
          <div className="state">
            <h3>
              {products.length === 0
                ? "Thực đơn đang được cập nhật"
                : "Không tìm thấy đồ uống"}
            </h3>
            <p>
              {products.length === 0
                ? "Bạn quay lại sau nhé."
                : "Thử từ khóa khác hoặc chọn nhóm khác nhé."}
            </p>
          </div>
        ) : (
          <div className="product-grid">
            {visible.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </section>
      <section className="bottom-banner container">
        <div>
          <span className="eyebrow">NGON THEO CÁCH CỦA BẠN</span>
          <h2>Ít chờ đợi. Thêm tận hưởng.</h2>
          <p>
            Chọn trước món yêu thích, dành thời gian cho những điều bạn thích
            hơn.
          </p>
        </div>
        <Link href="/register" className="outline-button">
          Tham gia BrewLite ↗
        </Link>
      </section>
    </>
  );
}
