// Hàm dùng chung cho test của TV4 (không phải file test vì không có đuôi .test.ts).
// Dựng PostgreSQL thật bằng PGlite, nạp 001 (schema đủ) và 002 (seed), thêm một sản phẩm riêng của TV4.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { DatabaseService } from "../src/config/db.js";
import type { PoolClient } from "../src/types/contracts.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const USER_ID = "demo-user-01";
export const PRODUCT_ID = "tv4-tra";
export const PRODUCT_INGREDIENT_ID = `test-ingredient-${PRODUCT_ID}`;
export const TOPPING_INGREDIENT_ID = `test-topping-${PRODUCT_ID}-tc`;
export const UNIT_S = 20000; // giá món size S
export const EXTRA_M = 5000; // phụ phí size M
export const TOPPING_TC = 7000; // topping "tc"

export async function createTestDb(): Promise<PGlite> {
  const db = new PGlite();
  const sql = (name: string) =>
    readFileSync(resolve(__dirname, "../database", name), "utf8");
  await db.exec(sql("001_schema.sql"));
  await db.exec(sql("007_order_payment_codes.sql"));
  await db.exec(sql("009_qr_reissue.sql"));
  await db.exec(sql("010_product_inventory.sql"));
  await db.exec(sql("002_seed.sql"));
  // Sản phẩm riêng với tồn kho theo nguyên liệu để các test không phụ thuộc menu mẫu.
  await db.query(
    `INSERT INTO products (id, name, category, price, sizes, toppings)
     VALUES ($1, 'Trà TV4', 'test', $2, $3::jsonb, $4::jsonb)`,
    [
      PRODUCT_ID,
      UNIT_S,
      JSON.stringify([
        { name: "S", extraPrice: 0 },
        { name: "M", extraPrice: EXTRA_M },
      ]),
      JSON.stringify([{ id: "tc", name: "Trân châu", price: TOPPING_TC }]),
    ],
  );
  await db.query(
    `INSERT INTO ingredients (id, name, unit, stock)
     VALUES ($1, 'Nguyên liệu test TV4', 'piece', 10),
            ($2, 'Topping test TV4', 'piece', 1000)`,
    [PRODUCT_INGREDIENT_ID, TOPPING_INGREDIENT_ID],
  );
  await db.query(
    `INSERT INTO product_recipes (product_id, size, ingredient_id, quantity)
     VALUES ($1, 'S', $2, 1), ($1, 'M', $2, 1)`,
    [PRODUCT_ID, PRODUCT_INGREDIENT_ID],
  );
  await db.query(
    `INSERT INTO topping_recipes (product_id, topping_id, ingredient_id, quantity)
     VALUES ($1, 'tc', $2, 1)`,
    [PRODUCT_ID, TOPPING_INGREDIENT_ID],
  );
  return db;
}

// PGlite trả số dòng ở affectedRows, còn model đọc rowCount (kiểu của thư viện pg).
export function asClient(database: PGlite): PoolClient {
  return {
    async query(text: string, params: unknown[] = []) {
      const result = await database.query(text, params);
      return {
        rows: result.rows,
        rowCount: result.affectedRows || result.rows.length,
      };
    },
  } as unknown as PoolClient;
}

export type Tx = <T>(
  operation: (client: PoolClient) => Promise<T>,
) => Promise<T>;

// Giống DatabaseService.withTransaction: BEGIN, chạy, COMMIT; lỗi thì ROLLBACK.
export function makeTx(database: PGlite): Tx {
  return async (operation) => {
    await database.exec("BEGIN");
    try {
      const result = await operation(asClient(database));
      await database.exec("COMMIT");
      return result;
    } catch (error) {
      await database.exec("ROLLBACK");
      throw error;
    }
  };
}

// Bản giả của DatabaseService: withTransaction cho OrdersService, query cho PromotionModel của TV1.
// (Với pg thật, query chạy trên kết nối riêng; PGlite chỉ có một kết nối nên dùng chung.)
export function makeFakeDatabase(database: PGlite): DatabaseService {
  return {
    withTransaction: makeTx(database),
    query: (text: string, params: unknown[] = []) => database.query(text, params),
  } as unknown as DatabaseService;
}

// Tạo khuyến mãi riêng cho test; mốc thời gian tính bằng giờ so với hiện tại.
export async function insertPromotion(
  database: PGlite,
  promotion: {
    id: string;
    code: string;
    type: "PERCENT" | "FIXED";
    value: number;
    minimumAmount?: number;
    active?: boolean;
    startsHoursFromNow?: number;
    endsHoursFromNow?: number;
  },
): Promise<void> {
  await database.query(
    `INSERT INTO promotions (id, code, type, value, minimum_amount, active, starts_at, ends_at)
     VALUES ($1, $2, $3, $4, $5, $6,
             now() + ($7::int * interval '1 hour'),
             now() + ($8::int * interval '1 hour'))`,
    [
      promotion.id,
      promotion.code,
      promotion.type,
      promotion.value,
      promotion.minimumAmount ?? 0,
      promotion.active ?? true,
      promotion.startsHoursFromNow ?? -24,
      promotion.endsHoursFromNow ?? 24,
    ],
  );
}

export async function readStock(database: PGlite): Promise<number> {
  const result = await database.query<{ stock: number }>(
    "SELECT stock FROM ingredients WHERE id = $1",
    [PRODUCT_INGREDIENT_ID],
  );
  return result.rows[0].stock;
}

export async function setStock(database: PGlite, stock: number): Promise<void> {
  await database.query("UPDATE ingredients SET stock = $1 WHERE id = $2", [
    stock,
    PRODUCT_INGREDIENT_ID,
  ]);
}

export async function readOrder(database: PGlite, orderId: string) {
  const result = await database.query<{
    status: string;
    stock_released: boolean;
    user_id: string;
  }>("SELECT status, stock_released, user_id FROM orders WHERE id = $1", [
    orderId,
  ]);
  return result.rows[0];
}

export async function countOrders(database: PGlite): Promise<number> {
  const result = await database.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM orders",
  );
  return result.rows[0].n;
}

// ---- Phần dùng cho test nguyên liệu (DB đủ 001, 002, 003, 004, 006) ----
export const NO_RECIPE_PRODUCT_ID = "tv4-khong-cong-thuc"; // món không có công thức nguyên liệu
export const ING_TEA = "tv4-nl-tra"; // nguyên liệu chính của món tv4-tra (ml)
export const ING_PEARL = "tv4-nl-tc"; // nguyên liệu của topping "tc" (gram)
export const ING_START = 1000; // tồn đầu mỗi nguyên liệu của TV4
export const TEA_PER_SIZE: Record<string, number> = { S: 100, M: 125, L: 150 };
export const PEARL_PER_TOPPING = 50;

// Dựng DB đủ 001, 002, 003, 004, 006. Mỗi file nạp bằng một lần exec riêng (mỗi lần là một transaction)
// để tránh lỗi "pending trigger events" khi 005/006 đổi bảng sau khi 003 vừa chèn dữ liệu.
// Món và công thức của TV4 được thêm SAU 006, vì 006 xóa công thức tạm của mọi món chưa có trong danh mục.
export async function createIngredientTestDb(): Promise<PGlite> {
  const database = new PGlite();
  const sql = (name: string) =>
    readFileSync(resolve(__dirname, "../database", name), "utf8");
  for (const file of [
    "001_schema.sql",
    "007_order_payment_codes.sql",
    "009_qr_reissue.sql",
    "010_product_inventory.sql",
    "002_seed.sql",
    "003_catalog.sql",
    "004_image_urls.sql",
    "006_recipe_data.sql",
  ]) {
    await database.exec(sql(file));
  }
  const sizes = JSON.stringify([
    { name: "S", extraPrice: 0 },
    { name: "M", extraPrice: EXTRA_M },
    { name: "L", extraPrice: 10000 },
  ]);
  const toppings = JSON.stringify([
    { id: "tc", name: "Trân châu", price: TOPPING_TC },
  ]);
  await database.query(
    `INSERT INTO products (id, name, category, price, sizes, toppings)
     VALUES ($1, 'Trà TV4', 'test', $2, $3::jsonb, $4::jsonb),
            ($5, 'Món chưa có công thức', 'test', $2, $3::jsonb, '[]'::jsonb)`,
    [PRODUCT_ID, UNIT_S, sizes, toppings, NO_RECIPE_PRODUCT_ID],
  );
  await database.query(
    `INSERT INTO ingredients (id, name, unit, stock) VALUES
       ($1, 'Trà TV4', 'ml', $3), ($2, 'Trân châu TV4', 'gram', $3)`,
    [ING_TEA, ING_PEARL, ING_START],
  );
  for (const [size, quantity] of Object.entries(TEA_PER_SIZE)) {
    await database.query(
      `INSERT INTO product_recipes (product_id, size, ingredient_id, quantity)
       VALUES ($1, $2, $3, $4)`,
      [PRODUCT_ID, size, ING_TEA, quantity],
    );
  }
  await database.query(
    `INSERT INTO topping_recipes (product_id, topping_id, ingredient_id, quantity)
     VALUES ($1, 'tc', $2, $3)`,
    [PRODUCT_ID, ING_PEARL, PEARL_PER_TOPPING],
  );
  return database;
}

export async function readIngredient(
  database: PGlite,
  ingredientId: string,
): Promise<number> {
  const result = await database.query<{ stock: number }>(
    "SELECT stock FROM ingredients WHERE id = $1",
    [ingredientId],
  );
  return result.rows[0].stock;
}

export async function setIngredient(
  database: PGlite,
  ingredientId: string,
  stock: number,
): Promise<void> {
  await database.query("UPDATE ingredients SET stock = $1 WHERE id = $2", [
    stock,
    ingredientId,
  ]);
}

export async function readReservations(
  database: PGlite,
  orderId: string,
): Promise<Array<{ ingredientId: string; quantity: number }>> {
  const result = await database.query<{ ingredientId: string; quantity: number }>(
    `SELECT ingredient_id AS "ingredientId", quantity
     FROM order_ingredient_reservations WHERE order_id = $1
     ORDER BY ingredient_id`,
    [orderId],
  );
  return result.rows;
}