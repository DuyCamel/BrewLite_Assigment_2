// TV3 — Test Auth với schema thật (001/002/003) trên PGlite, cùng cách dựng DB như test/database.test.ts.
// Kiểm tra SQL của UserModel khớp bảng users và tài khoản seed đăng nhập được.
import "reflect-metadata";
import { PGlite } from "@electric-sql/pglite";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { HttpException } from "@nestjs/common";
const __dirname = dirname(fileURLToPath(import.meta.url));
import type { DatabaseService } from "../src/config/db.js";
import { UserModel } from "../src/models/user.model.js";
import { AuthService } from "../src/services/auth.service.js";
import { UsersService } from "../src/services/users.service.js";
const pglite = new PGlite();
const db = {
  query: (sql: string, parameters: unknown[] = []) =>
    pglite.query(sql, parameters),
} as unknown as DatabaseService;
const users = new UsersService(new UserModel(db));
const auth = new AuthService(users);
const sql = (name: string) =>
  readFileSync(resolve(__dirname, "../database", name), "utf8");
const saved = {
  PRODUCT_DATA_SOURCE: process.env.PRODUCT_DATA_SOURCE,
  JWT_SECRET: process.env.JWT_SECRET,
};
before(async () => {
  process.env.PRODUCT_DATA_SOURCE = "postgres";
  process.env.JWT_SECRET = "test-secret-for-brewlite-auth-0123456789abcdef";
  await pglite.exec("BEGIN");
  await pglite.exec(sql("001_schema.sql"));
  await pglite.exec(sql("002_integrity.sql"));
  await pglite.exec(sql("003_seed.sql"));
  await pglite.exec("COMMIT");
});
after(async () => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await pglite.close();
});
test("tài khoản seed đăng nhập được bằng mật khẩu demo và token mở được /auth/me", async () => {
  const row = (
    await pglite.query<{ email: string }>("SELECT email FROM users LIMIT 1")
  ).rows[0];
  assert.ok(row);
  const session = await auth.login({
    email: row.email,
    password: "BrewLite123!",
  });
  const identity = auth.verifyAccessToken(session.accessToken);
  assert.equal(identity.email.toLowerCase(), row.email.toLowerCase());
  const me = await users.getCurrentUser(identity.id);
  assert.equal(me.id, session.user.id);
  assert.equal("passwordHash" in me, false);
  assert.equal(JSON.stringify(session).includes("$2"), false);
});
test("đăng ký ghi đúng vào bảng users: hash bcrypt, 0 điểm, email chữ thường, tham số hóa SQL", async () => {
  const email = "o'brien+tv3@example.com";
  const created = await auth.register({ email, password: "Mat-khau-moi-1" });
  assert.equal(created.email, email);
  assert.equal(created.loyaltyPoints, 0);
  const stored = (
    await pglite.query<{
      password_hash: string;
      display_name: string;
      loyalty_points: number;
    }>(
      "SELECT password_hash, display_name, loyalty_points FROM users WHERE id = $1",
      [created.id],
    )
  ).rows[0];
  assert.ok(stored);
  assert.match(stored.password_hash, /^\$2[aby]\$/);
  assert.equal(Number(stored.loyalty_points), 0);
  assert.ok(stored.display_name.length > 0);
  const session = await auth.login({
    email: email.toUpperCase(),
    password: "Mat-khau-moi-1",
  });
  assert.equal(session.user.id, created.id);
});
test("đăng ký trùng email khác hoa thường bị DB chặn và trả 409", async () => {
  await auth.register({
    email: "trung.email@example.com",
    password: "Mat-khau-moi-1",
  });
  await assert.rejects(
    auth.register({
      email: "TRUNG.EMAIL@example.com",
      password: "Mat-khau-moi-1",
    }),
    (error: unknown) => {
      assert.ok(error instanceof HttpException);
      assert.equal(error.getStatus(), 409);
      return true;
    },
  );
});
