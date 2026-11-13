import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import type { PoolClient } from "pg";
import { runDatabase } from "../scripts/database.js";
import { makeFakeDatabase } from "./tv4-helpers.js";

const directory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../database",
);
const sql = (name: string) => readFileSync(resolve(directory, name), "utf8");
const schemaChecksums = [
  "53c09d3c9398789b9e4d0c8a3db58d6308337ff8aecfe704cf729853d1a6e352",
  "68041647aac8ec2ff896bc76a56377661c4256a08e7afbd00306d001e0946412",
  "bf80544a5fc4bf03bed9f77f3fb7dbb3334482d278237252d2ef5dcc4cdebe6b",
  "723290523a6b063f77930f448628c502145c5509addc94bf4c2a0e0e10199bed",
];

test("migration runner supports fresh DBs and known main/Toan schema history", async (t) => {
  const pg = new PGlite();
  const database = makeFakeDatabase(pg);
  database.onModuleDestroy = async () => {};
  database.withTransaction = (operation) =>
    pg.transaction(async (transaction) => {
      const client = {
        async query(text: string, params: unknown[] = []) {
          const result = params.length
            ? await transaction.query(text, params)
            : (await transaction.exec(text)).at(-1);
          return {
            rows: result?.rows ?? [],
            rowCount: result?.affectedRows ?? result?.rows.length ?? 0,
          };
        },
      };
      return operation(client as unknown as PoolClient);
    });

  try {
    await runDatabase("migrate", database);
    await runDatabase("seed", database);
    await runDatabase("migrate", database);
    await runDatabase("seed", database);
    const orders = await pg.query(
      "SELECT id, total, status FROM orders ORDER BY id",
    );
    const ingredients = await pg.query("SELECT * FROM ingredients ORDER BY id");
    const expectedChecksum = createHash("sha256")
      .update(sql("001_schema.sql"))
      .digest("hex");

    await t.test(
      "upgrade a main DB that has not applied migration 010",
      async () => {
        await pg.exec(
          "ALTER TABLE products ADD COLUMN stock INTEGER NOT NULL DEFAULT 13; DELETE FROM schema_migrations WHERE name='010_product_inventory.sql'",
        );
        await pg.query(
          "UPDATE schema_migrations SET checksum=$1 WHERE name='001_schema.sql'",
          [schemaChecksums[2]],
        );
        await runDatabase("migrate", database);
        assert.deepEqual(
          (await pg.query("SELECT id, total, status FROM orders ORDER BY id"))
            .rows,
          orders.rows,
        );
        assert.deepEqual(
          (await pg.query("SELECT * FROM ingredients ORDER BY id")).rows,
          ingredients.rows,
        );
        assert.equal(
          (
            await pg.query(
              "SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='stock'",
            )
          ).rows.length,
          0,
        );
      },
    );

    for (const checksum of schemaChecksums) {
      await t.test(
        `upgrade known schema ${checksum.slice(0, 8)} after migration 010`,
        async () => {
          await pg.query(
            "UPDATE schema_migrations SET checksum=$1 WHERE name='001_schema.sql'",
            [checksum],
          );
          await runDatabase("migrate", database);
          assert.deepEqual(
            (await pg.query("SELECT id, total, status FROM orders ORDER BY id"))
              .rows,
            orders.rows,
          );
          assert.deepEqual(
            (await pg.query("SELECT * FROM ingredients ORDER BY id")).rows,
            ingredients.rows,
          );
          assert.deepEqual(
            (
              await pg.query(
                "SELECT checksum FROM schema_migrations WHERE name='001_schema.sql'",
              )
            ).rows,
            [{ checksum: expectedChecksum }],
          );
          assert.equal(
            (
              await pg.query(
                "SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='stock'",
              )
            ).rows.length,
            0,
          );
        },
      );
    }

    for (const name of ["001_schema.sql", "006_recipe_data.sql"]) {
      await t.test(`reject unknown checksum for ${name}`, async () => {
        const saved = await pg.query<{ checksum: string }>(
          "SELECT checksum FROM schema_migrations WHERE name=$1",
          [name],
        );
        await pg.query(
          "UPDATE schema_migrations SET checksum=$2 WHERE name=$1",
          [name, "unknown-checksum"],
        );
        try {
          await assert.rejects(
            runDatabase("migrate", database),
            /Migration đã chạy bị sửa/,
          );
        } finally {
          await pg.query(
            "UPDATE schema_migrations SET checksum=$2 WHERE name=$1",
            [name, saved.rows[0].checksum],
          );
        }
      });
    }
  } finally {
    await pg.close();
  }
});
