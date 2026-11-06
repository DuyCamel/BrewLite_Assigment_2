"use client";
// TV1 — Card nối đến file chi tiết còn TODO. Không giả lập thêm giỏ khi Cart chưa triển khai.
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Product } from "@/types/product";

export function ProductCard({ product: p }: { product: Product }) {
  const imageUrl = p.imageUrl;
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <article className="product-card">
      <Link
        href={`/products/${p.id}`}
        className="product-image"
        aria-label={`Xem ${p.name}`}
      >
        {p.badge && <span className="badge">{p.badge}</span>}
        {imageUrl && !imageFailed ? (
          <Image
            className="product-photo"
            src={imageUrl}
            alt={p.name}
            fill
            sizes="(max-width: 720px) 100vw, (max-width: 1000px) 33vw, 25vw"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <span className="photo-placeholder" aria-hidden="true">
            Thêm ảnh đồ uống
          </span>
        )}
      </Link>
      <div className="product-info">
        <span className="product-category">{p.category}</span>
        <h3>
          <Link href={`/products/${p.id}`}>{p.name}</Link>
        </h3>
        <p>{p.description}</p>
        <div className="product-bottom">
          <strong>
            {new Intl.NumberFormat("vi-VN").format(p.price)}
            <small>đ</small>
          </strong>
          <Link
            href={`/products/${p.id}`}
            className="product-action"
            aria-label={`Chọn ${p.name}`}
          >
            ↗
          </Link>
        </div>
      </div>
    </article>
  );
}
