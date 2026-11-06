// TV3 — Quên mật khẩu đi qua HTTP thật: toàn bộ AppModule với PGlite (schema 001/002/003 + migration 008) và Mailer ghi lại thư.
// Kiểm tra SQL nguyên tử (dùng một lần, hết hạn, song song, giới hạn tần suất) và hành vi người dùng thật thấy.
import "reflect-metadata";
import { PGlite } from "@electric-sql/pglite";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { after, before, test } from "node:test";
import { Module, type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { DatabaseService } from "../src/config/db";
import { Mailer, type PasswordResetMail } from "../src/services/mailer";
import { FORGOT_PASSWORD_MESSAGE } from "../src/services/password-reset.service";

const SECRET = "test-secret-for-brewlite-password-reset-0123456789";
const OLD = "Mat-khau-cu-1";
const NEW = "Mat-khau-moi-2";
const pg = new PGlite();
const adapter = {
  query: async (text: string, params: unknown[] = []) => {
    const r = await pg.query<Record<string, unknown>>(text, params);
    return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
  },
};
const mails: PasswordResetMail[] = [];
const captureMailer = {
  sendPasswordReset: async (mail: PasswordResetMail) => {
    mails.push(mail);
  },
};
const sql = (name: string) =>
  readFileSync(resolve(__dirname, "../database", name), "utf8");
const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const saved = {
  PRODUCT_DATA_SOURCE: process.env.PRODUCT_DATA_SOURCE,
  JWT_SECRET: process.env.JWT_SECRET,
  FRONTEND_ORIGIN: process.env.FRONTEND_ORIGIN,
};
let app: INestApplication;
let origin = "";

before(async () => {
  process.env.PRODUCT_DATA_SOURCE = "postgres";
  process.env.JWT_SECRET = SECRET;
  delete process.env.FRONTEND_ORIGIN;
  await pg.exec("BEGIN");
  for (const file of [
    "001_schema.sql",
    "002_integrity.sql",
    "003_seed.sql",
    "008_password_reset.sql",
  ])
    await pg.exec(sql(file));
  await pg.exec("COMMIT");
  const controllers = Reflect.getMetadata(
    "controllers",
    AppModule,
  ) as unknown[];
  const providers = (
    Reflect.getMetadata("providers", AppModule) as unknown[]
  ).map((provider) => {
    if (provider === DatabaseService)
      return { provide: DatabaseService, useValue: adapter };
    if (
      typeof provider === "object" &&
      provider !== null &&
      (provider as { provide?: unknown }).provide === Mailer
    )
      return { provide: Mailer, useValue: captureMailer };
    return provider;
  });
  @Module({
    controllers: controllers as never[],
    providers: providers as never[],
  })
  class TestModule {}
  app = await NestFactory.create(TestModule, { logger: false });
  await app.listen(0, "127.0.0.1");
  origin = await app.getUrl();
});
after(async () => {
  await app?.close();
  await pg.close();
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

async function api(path: string, body?: unknown) {
  const response = await fetch(`${origin}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}
async function newUser(name: string) {
  const email = `${name}@example.com`;
  const created = await api("/auth/register", { email, password: OLD });
  assert.equal(created.status, 201);
  return { email, id: created.body.user.id as string };
}
const login = (email: string, password: string) =>
  api("/auth/login", { email, password });
async function request(email: string): Promise<string | null> {
  const before = mails.length;
  const result = await api("/auth/forgot-password", { email });
  assert.equal(result.status, 200);
  if (mails.length === before) return null;
  const match = /#token=([A-Za-z0-9_-]{43})$/.exec(
    mails[mails.length - 1]!.resetUrl,
  );
  assert.ok(match, "liên kết trong thư phải có token");
  return match[1]!;
}
const skipCooldown = (userId: string) =>
  pg.query(
    "UPDATE password_reset_tokens SET created_at = created_at - interval '2 minutes' WHERE user_id = $1",
    [userId],
  );
const rows = async (userId: string) =>
  (
    await pg.query<{ token_hash: string; used_at: string | null }>(
      "SELECT token_hash, used_at FROM password_reset_tokens WHERE user_id = $1 ORDER BY created_at",
      [userId],
    )
  ).rows;

test("forgot-password trả phản hồi giống hệt cho email có và không có tài khoản; chỉ email có tài khoản nhận thư", async () => {
  const { email } = await newUser("quen.1");
  const known = await api("/auth/forgot-password", { email });
  const unknown = await api("/auth/forgot-password", {
    email: "khong.ton.tai@example.com",
  });
  const upper = await api("/auth/forgot-password", {
    email: email.toUpperCase(),
  });
  for (const r of [known, unknown, upper]) {
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { message: FORGOT_PASSWORD_MESSAGE });
  }
  assert.equal(
    mails.filter((m) => m.to === email).length,
    1,
    "chỉ một thư (lần gửi thứ hai trong 60 giây bị giới hạn)",
  );
  assert.equal(
    mails.filter((m) => m.to === "khong.ton.tai@example.com").length,
    0,
  );
  const bad = await api("/auth/forgot-password", { email: "khong-phai-email" });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.code, "VALIDATION_FAILED");
});
test("DB chỉ lưu mã băm của token, token gốc không tồn tại ở đâu trong DB", async () => {
  const { email, id } = await newUser("quen.2");
  const token = await request(email);
  assert.ok(token);
  const stored = await rows(id);
  assert.equal(stored.length, 1);
  assert.equal(stored[0]!.token_hash, sha256(token));
  const leak = await pg.query(
    "SELECT 1 FROM password_reset_tokens WHERE token_hash = $1",
    [token],
  );
  assert.equal(leak.rows.length, 0);
});
test("đặt lại mật khẩu: mật khẩu mới dùng được, mật khẩu cũ hết dùng, token dùng lại bị từ chối", async () => {
  const { email } = await newUser("quen.3");
  const token = (await request(email))!;
  assert.equal((await login(email, OLD)).status, 200);
  const done = await api("/auth/reset-password", { token, password: NEW });
  assert.equal(done.status, 200);
  assert.equal((await login(email, NEW)).status, 200);
  assert.equal((await login(email, OLD)).status, 401);
  const again = await api("/auth/reset-password", {
    token,
    password: "Mat-khau-khac-3",
  });
  assert.equal(again.status, 400);
  assert.equal(again.body.code, "RESET_TOKEN_INVALID");
  assert.equal(
    (await login(email, "Mat-khau-khac-3")).status,
    401,
    "token đã dùng không được đổi mật khẩu lần nữa",
  );
});
test("mật khẩu mới quá yếu bị từ chối nhưng token chưa bị tiêu hao", async () => {
  const { email } = await newUser("quen.4");
  const token = (await request(email))!;
  const weak = await api("/auth/reset-password", { token, password: "yeu" });
  assert.equal(weak.status, 400);
  assert.equal(weak.body.code, "VALIDATION_FAILED");
  assert.equal(
    (await api("/auth/reset-password", { token, password: NEW })).status,
    200,
  );
});
test("token không có thật, sai dạng hoặc hết hạn đều bị từ chối bằng cùng một mã lỗi", async () => {
  const { email, id } = await newUser("quen.5");
  const token = (await request(email))!;
  await pg.query(
    "UPDATE password_reset_tokens SET expires_at = now() - interval '1 minute' WHERE user_id = $1",
    [id],
  );
  for (const candidate of [token, "A".repeat(43), "ngan", ""]) {
    const result = await api("/auth/reset-password", {
      token: candidate,
      password: NEW,
    });
    assert.equal(result.status, 400, candidate.slice(0, 8));
    assert.equal(result.body.code, "RESET_TOKEN_INVALID");
  }
  assert.equal((await login(email, OLD)).status, 200, "mật khẩu không bị đổi");
});
test("hai request dùng cùng một token song song: đúng một cái thành công", async () => {
  const { email } = await newUser("quen.6");
  const token = (await request(email))!;
  const results = await Promise.all([
    api("/auth/reset-password", { token, password: "Song-song-A-1" }),
    api("/auth/reset-password", { token, password: "Song-song-B-2" }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 400]);
  const winner = results[0]!.status === 200 ? "Song-song-A-1" : "Song-song-B-2";
  assert.equal((await login(email, winner)).status, 200);
});
test("giới hạn tần suất: 1 lần/60 giây; yêu cầu mới vô hiệu hóa liên kết cũ; tối đa 5 lần/giờ", async () => {
  const { email, id } = await newUser("quen.7");
  const first = (await request(email))!;
  assert.equal(
    await request(email),
    null,
    "yêu cầu ngay sau đó bị giới hạn (không gửi thư)",
  );
  assert.equal((await rows(id)).length, 1);
  await skipCooldown(id);
  const second = (await request(email))!;
  assert.notEqual(first, second);
  const stale = await api("/auth/reset-password", {
    token: first,
    password: NEW,
  });
  assert.equal(
    stale.status,
    400,
    "liên kết cũ phải bị vô hiệu hóa khi có liên kết mới",
  );
  for (let i = 0; i < 3; i += 1) {
    await skipCooldown(id);
    assert.ok(await request(email), `lần ${i + 3}`);
  }
  await skipCooldown(id);
  assert.equal((await rows(id)).length, 5);
  assert.equal(await request(email), null, "đã đủ 5 lần trong 1 giờ");
  assert.equal((await rows(id)).length, 5);
});
test("đặt lại mật khẩu vô hiệu hóa mọi token khác còn sống của cùng tài khoản và không đụng tài khoản khác", async () => {
  const a = await newUser("quen.8a");
  const b = await newUser("quen.8b");
  const tokenA = (await request(a.email))!;
  await request(b.email);
  const extra = "C".repeat(43); // giả lập token thứ hai còn sống do hai yêu cầu gần như đồng thời
  await pg.query(
    "INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at) VALUES ('extra-token', $1, $2, now() + interval '10 minutes')",
    [a.id, sha256(extra)],
  );
  assert.equal(
    (await api("/auth/reset-password", { token: tokenA, password: NEW }))
      .status,
    200,
  );
  const stale = await api("/auth/reset-password", {
    token: extra,
    password: "Khac-hoan-toan-9",
  });
  assert.equal(stale.status, 400);
  assert.equal(
    (await login(b.email, OLD)).status,
    200,
    "tài khoản khác giữ nguyên mật khẩu",
  );
  assert.equal(
    (await rows(b.id)).filter((r) => r.used_at === null).length,
    1,
    "token của tài khoản khác vẫn còn sống",
  );
});
test("xóa tài khoản xóa luôn token; token hết hạn quá 7 ngày được dọn khi có yêu cầu mới", async () => {
  const { email, id } = await newUser("quen.9");
  await request(email);
  await pg.query(
    "INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at) VALUES ('cu-8-ngay', $1, $2, now() - interval '8 days')",
    [id, sha256("D".repeat(43))],
  );
  await skipCooldown(id);
  await request(email);
  const ids = (
    await pg.query<{ id: string }>(
      "SELECT id FROM password_reset_tokens WHERE user_id = $1",
      [id],
    )
  ).rows.map((r) => r.id);
  assert.equal(
    ids.includes("cu-8-ngay"),
    false,
    "token quá hạn 8 ngày phải được dọn",
  );
  await pg.query("DELETE FROM users WHERE id = $1", [id]);
  assert.equal((await rows(id)).length, 0);
});
