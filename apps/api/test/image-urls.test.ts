import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("image backfill repairs missing URLs without replacing custom images", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE products (id TEXT PRIMARY KEY, image_url TEXT);
      INSERT INTO products VALUES
        ('ca-phe-sua', NULL),
        ('bac-xiu', '/images/custom.webp'),
        ('unknown', NULL)`);
    await db.exec(readFileSync(new URL("../database/008_image_urls_backfill.sql", import.meta.url), "utf8"));
    const result = await db.query<{ id: string; image_url: string | null }>(
      "SELECT id, image_url FROM products ORDER BY id",
    );
    assert.deepEqual(result.rows, [
      { id: "bac-xiu", image_url: "/images/custom.webp" },
      { id: "ca-phe-sua", image_url: "/images/products/ca-phe-sua.jpg" },
      { id: "unknown", image_url: null },
    ]);
  } finally {
    await db.close();
  }
});
