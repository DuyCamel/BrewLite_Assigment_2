// TV3 duy trì runner/checksum/transaction; mỗi TV đề xuất migration phần mình. TV1 dùng khi dựng local, TV6 dùng trong CD.
// SQL 001: schema và các migration nền. SQL 002: dữ liệu demo, không tự chạy khi start ứng dụng.
import "../src/config/environment.js";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { DatabaseService } from "../src/config/db.js";
const __dirname = dirname(fileURLToPath(import.meta.url));
// Verified main/Toan schema variants differ only in text encoding (LF/CRLF included).
const compatibleSchemaChecksums = new Set([
  "53c09d3c9398789b9e4d0c8a3db58d6308337ff8aecfe704cf729853d1a6e352",
  "68041647aac8ec2ff896bc76a56377661c4256a08e7afbd00306d001e0946412",
  "bf80544a5fc4bf03bed9f77f3fb7dbb3334482d278237252d2ef5dcc4cdebe6b",
  "723290523a6b063f77930f448628c502145c5509addc94bf4c2a0e0e10199bed",
]);
export async function runDatabase(
  action: string | undefined,
  db = new DatabaseService(),
) {
  try {
    if (action === "check") {
      await db.ping();
    } else if (action === "migrate" || action === "seed") {
      await db.withTransaction(async (client) => {
        // Hai người chạy lệnh cùng lúc vẫn tuần tự trên cùng DB.
        await client.query("SELECT pg_advisory_xact_lock(22032006)");
        if (action === "migrate") {
          await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations
       (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
          const directory = resolve(__dirname, "../database");
          const files = readdirSync(directory)
            .filter((name) =>
              [
                "001_schema.sql",
                "003_catalog.sql",
                "004_image_urls.sql",
                "006_recipe_data.sql",
                "007_order_payment_codes.sql",
                "008_image_urls_backfill.sql",
                "009_qr_reissue.sql",
                "010_product_inventory.sql",
                "011_sepay_payment_method.sql",
              ].includes(name),
            )
            .sort();
          for (const name of files) {
            if (
              name === "003_catalog.sql" ||
              name === "004_image_urls.sql" ||
              name === "006_recipe_data.sql" ||
              name === "008_image_urls_backfill.sql"
            ) {
              const products = await client.query(
                "SELECT EXISTS (SELECT 1 FROM products) AS has_products",
              );
              if (!products.rows[0].has_products) {
                console.log(
                  `Tạm hoãn ${name}: chưa có sản phẩm. Chạy db:seed rồi db:migrate lại.`,
                );
                continue;
              }
            }
            const sql = readFileSync(resolve(directory, name), "utf8");
            const checksum = createHash("sha256").update(sql).digest("hex");
            const current = await client.query(
              "SELECT checksum FROM schema_migrations WHERE name=$1",
              [name],
            );
            if (current.rows.length) {
              if (current.rows[0].checksum !== checksum) {
                if (
                  name === "001_schema.sql" &&
                  compatibleSchemaChecksums.has(current.rows[0].checksum) &&
                  compatibleSchemaChecksums.has(checksum)
                ) {
                  // Do not replay schema 001: migration 010 has removed products.stock.
                  await client.query(
                    "UPDATE schema_migrations SET checksum=$2 WHERE name=$1",
                    [name, checksum],
                  );
                  console.log(`Đã cập nhật ${name}`);
                  continue;
                }
                throw new Error(
                  `Migration đã chạy bị sửa: ${name}. Tạo file phiên bản mới.`,
                );
              }
              continue;
            }
            await client.query(sql);
            await client.query(
              "INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)",
              [name, checksum],
            );
            console.log(`Đã áp dụng ${name}`);
          }
        } else {
          await client.query(
            readFileSync(
              resolve(__dirname, "../database/002_seed.sql"),
              "utf8",
            ),
          );
        }
      });
    } else throw new Error("Dùng migrate, seed hoặc check");
    console.log(`Database ${action}: thành công`);
  } finally {
    await db.onModuleDestroy();
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  runDatabase(process.argv[2]).catch((error) => {
    console.error(
      "Lỗi database. Kiểm tra .env, thứ tự schema/seed và quyền tạo bảng.",
    );
    if (error && typeof error === "object" && "code" in error)
      console.error("Mã lỗi:", error.code);
    if (error instanceof Error) console.error("Chi tiết:", error.message);
    if (error instanceof Error && error.message.startsWith("Migration đã chạy"))
      console.error(error.message);
    process.exitCode = 1;
  });
}
