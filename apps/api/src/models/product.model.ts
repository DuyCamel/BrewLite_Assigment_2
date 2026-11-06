// TV1 — Model chứa SQL cho sản phẩm. Seed dùng chung cho DB và chế độ sample.
import { ConflictException, Inject, Injectable } from "@nestjs/common";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseService } from "../config/db.js";
import { dataSource } from "../config/environment.js";
import { Product } from "../types/product.types.js";
const __dirname = dirname(fileURLToPath(import.meta.url));
const unavailableProductIds = new Set([
  "matcha-kem",
  "matcha-dua",
  "matcha-dau",
  "matcha-yen-mach",
]);
@Injectable()
export class ProductModel {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}
  async checkStock(
    productId: string,
    size: string,
    toppingIds: string[],
    quantity: number,
  ): Promise<void> {
    const result = await this.db.query<{ name: string; stock: number; required: number }>(
      `WITH requested AS (
         SELECT $1::text AS product_id, $2::text AS size, $3::jsonb AS topping_ids, $4::int AS line_quantity
       ), recipe_rows AS (
         SELECT i.name, i.stock, r.quantity * q.line_quantity AS required
         FROM requested q JOIN product_recipes r ON r.product_id=q.product_id AND r.size=q.size
         JOIN ingredients i ON i.id=r.ingredient_id
         UNION ALL
         SELECT i.name, i.stock, r.quantity * q.line_quantity
         FROM requested q CROSS JOIN LATERAL jsonb_array_elements_text(q.topping_ids) t
         JOIN topping_recipes r ON r.product_id=q.product_id AND r.topping_id=t
         JOIN ingredients i ON i.id=r.ingredient_id
       )
       SELECT name, stock, SUM(required)::int AS required
       FROM recipe_rows GROUP BY name, stock`,
      [productId, size, JSON.stringify(toppingIds), quantity],
    );
    if (result.rows.length === 0) {
      throw new ConflictException(
        "Sản phẩm hoặc topping chưa có công thức nguyên liệu",
      );
    }

    const unavailable = result.rows.find((row) => row.stock < row.required);
    if (unavailable) {
      throw new ConflictException("Nguyên liệu không đủ");
    }
  }
  async findAll(): Promise<Product[]> {
    if (dataSource() === "sample") {
      const products = JSON.parse(
        readFileSync(
          resolve(__dirname, "../../database/seed/products.json"),
          "utf8",
        ),
      );
      return products.filter(
        (product: Product) => !unavailableProductIds.has(product.id),
      );
    }
    const result = await this.db.query<Product>(
      `SELECT id, name, category, price, description,
      badge, image_url AS "imageUrl", stock, sizes, toppings FROM products
      WHERE id <> ALL($1::text[]) ORDER BY position, id`,
      [[...unavailableProductIds]],
    );
    return result.rows;
  }
  // TODO TV1: SELECT với tham số $1, trả Product hoặc null; service xử lý 404.
  // Gắn GET /products/:id và /products/[id]. Hiện chưa triển khai.
  async findById(id: string): Promise<Product | null> {
    if (dataSource() === "sample") {
      const products = JSON.parse(
        readFileSync(
          resolve(__dirname, "../../database/seed/products.json"),
          "utf8",
        ),
      ) as Product[];
      return (
        products.find(
          (product) =>
            product.id === id && !unavailableProductIds.has(product.id),
        ) ?? null
      );
    }
    // nếu không phải sample, thì gọi SQL để lấy sản phẩm theo id
    const result = await this.db.query<Product>(
      `SELECT id, name, category, price, description,
        badge, image_url AS "imageUrl", stock, sizes, toppings FROM products
        WHERE id = $1 AND id <> ALL($2::text[])`,
      [id, [...unavailableProductIds]],
    );
    return result.rows[0] ?? null;
  }
}
