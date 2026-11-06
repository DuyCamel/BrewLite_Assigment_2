// TV3 — Quên mật khẩu, test đơn vị (không cần DB): kiểm tra đầu vào, logic service, cấu hình và các Mailer.
import "reflect-metadata";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, before, test } from "node:test";
import { HttpException } from "@nestjs/common";
import {
  passwordResetConfig,
  mailConfig,
  ConfigurationError,
} from "../src/config/environment";
import {
  parseForgotPasswordInput,
  parseResetPasswordInput,
  RESET_TOKEN_PATTERN,
} from "../src/services/auth-validation";
import {
  ConsoleMailer,
  SmtpMailer,
  createMailer,
  type Mailer,
  type PasswordResetMail,
} from "../src/services/mailer";
import {
  FORGOT_PASSWORD_MESSAGE,
  PasswordResetService,
  RESET_PASSWORD_MESSAGE,
} from "../src/services/password-reset.service";
import type { UsersService } from "../src/services/users.service";
import type { UserRecord } from "../src/types/auth.types";

const ENV_KEYS = [
  "PRODUCT_DATA_SOURCE",
  "PASSWORD_RESET_EXPIRES_IN_MINUTES",
  "PASSWORD_RESET_BASE_URL",
  "FRONTEND_ORIGIN",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_SECURE",
  "SMTP_USER",
  "SMTP_PASS",
  "MAIL_FROM",
  "NODE_ENV",
] as const;
const saved: Record<string, string | undefined> = {};
before(() => {
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  process.env.PRODUCT_DATA_SOURCE = "postgres";
});
after(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});
const user: UserRecord = {
  id: "u1",
  email: "an@example.com",
  passwordHash: "x",
  displayName: "an",
  loyaltyPoints: 0,
};
class FakeUsers {
  tokens: { userId: string; tokenHash: string; ttlSeconds: number }[] = [];
  resets: { tokenHash: string; passwordHash: string }[] = [];
  allowCreate = true;
  allowReset = true;
  async findByEmail(email: string) {
    return email === user.email ? user : null;
  }
  async createPasswordResetToken(
    userId: string,
    tokenHash: string,
    ttlSeconds: number,
  ) {
    if (!this.allowCreate) return false;
    this.tokens.push({ userId, tokenHash, ttlSeconds });
    return true;
  }
  async resetPasswordWithToken(tokenHash: string, passwordHash: string) {
    this.resets.push({ tokenHash, passwordHash });
    return this.allowReset;
  }
}
class FakeMailer {
  sent: PasswordResetMail[] = [];
  fail = false;
  async sendPasswordReset(mail: PasswordResetMail) {
    this.sent.push(mail);
    if (this.fail) throw new Error("SMTP down");
  }
}
function setup() {
  const users = new FakeUsers();
  const mailer = new FakeMailer();
  return {
    users,
    mailer,
    service: new PasswordResetService(
      users as unknown as UsersService,
      mailer as unknown as Mailer,
    ),
  };
}
async function expectHttp(
  operation: () => unknown,
  status: number,
  code?: string,
) {
  await assert.rejects(
    async () => {
      await operation();
    },
    (error: unknown) => {
      assert.ok(error instanceof HttpException, "phải là HttpException");
      assert.equal(error.getStatus(), status);
      if (code)
        assert.equal((error.getResponse() as { code?: string }).code, code);
      return true;
    },
  );
}
const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

test("kiểm tra đầu vào: email chuẩn hóa, mật khẩu mới theo cùng quy tắc đăng ký", () => {
  assert.deepEqual(parseForgotPasswordInput({ email: "  An@Example.COM " }), {
    email: "an@example.com",
  });
  for (const body of [
    undefined,
    null,
    {},
    { email: "khong-phai-email" },
    { email: 5 },
  ])
    assert.throws(() => parseForgotPasswordInput(body), HttpException);
  assert.deepEqual(
    parseResetPasswordInput({
      token: " abc ",
      password: "Mat-khau-moi-1",
      role: "ADMIN",
    }),
    { token: "abc", password: "Mat-khau-moi-1" },
  );
  for (const password of [
    "ngan1",
    "chicochucai",
    "12345678",
    `a1${"x".repeat(71)}`,
    undefined,
  ])
    assert.throws(
      () => parseResetPasswordInput({ token: "t", password }),
      HttpException,
      String(password),
    );
  assert.ok(RESET_TOKEN_PATTERN.test("A".repeat(43)));
  for (const bad of [
    "",
    "A".repeat(42),
    "A".repeat(44),
    `${"A".repeat(42)}=`,
    `${"A".repeat(42)}/`,
    "A".repeat(42) + " ",
  ])
    assert.equal(RESET_TOKEN_PATTERN.test(bad), false, JSON.stringify(bad));
});
test("email có tài khoản: tạo token (chỉ lưu mã băm), gửi liên kết dùng dấu #, cùng thông báo với email lạ", async () => {
  const { users, mailer, service } = setup();
  const known = await service.requestReset({ email: "AN@example.com" });
  const unknown = await service.requestReset({ email: "khongco@example.com" });
  assert.deepEqual(known, { message: FORGOT_PASSWORD_MESSAGE });
  assert.deepEqual(
    unknown,
    known,
    "phản hồi phải giống hệt để không lộ email nào đã đăng ký",
  );
  assert.equal(users.tokens.length, 1, "email lạ không tạo token");
  assert.equal(mailer.sent.length, 1, "email lạ không gửi mail");
  const mail = mailer.sent[0]!;
  const match =
    /^http:\/\/localhost:3000\/reset-password#token=([A-Za-z0-9_-]{43})$/.exec(
      mail.resetUrl,
    );
  assert.ok(match, `liên kết sai dạng: ${mail.resetUrl}`);
  const rawToken = match[1]!;
  assert.equal(mail.to, "an@example.com");
  assert.equal(mail.expiresInMinutes, 30);
  const stored = users.tokens[0]!;
  assert.equal(stored.tokenHash, sha256(rawToken));
  assert.notEqual(stored.tokenHash, rawToken);
  assert.equal(stored.ttlSeconds, 30 * 60);
  const second = await setup().service.requestReset({
    email: "an@example.com",
  });
  assert.deepEqual(second, known);
});
test("mỗi lần yêu cầu sinh token khác nhau (ngẫu nhiên, không đoán được)", async () => {
  const { users, service } = setup();
  for (let i = 0; i < 20; i += 1)
    await service.requestReset({ email: "an@example.com" });
  assert.equal(new Set(users.tokens.map((t) => t.tokenHash)).size, 20);
});
test("bị giới hạn số lần yêu cầu thì không gửi mail nhưng vẫn trả cùng thông báo", async () => {
  const { users, mailer, service } = setup();
  users.allowCreate = false;
  assert.deepEqual(await service.requestReset({ email: "an@example.com" }), {
    message: FORGOT_PASSWORD_MESSAGE,
  });
  assert.equal(mailer.sent.length, 0);
});
test("gửi mail lỗi không làm hỏng phản hồi và không lộ lỗi", async () => {
  const { mailer, service } = setup();
  mailer.fail = true;
  assert.deepEqual(await service.requestReset({ email: "an@example.com" }), {
    message: FORGOT_PASSWORD_MESSAGE,
  });
});
test("địa chỉ web trong liên kết lấy từ cấu hình: ưu tiên PASSWORD_RESET_BASE_URL, nếu không thì origin đầu của FRONTEND_ORIGIN", async () => {
  process.env.FRONTEND_ORIGIN =
    "https://web.brewlite.vn/, http://localhost:3000";
  let ctx = setup();
  await ctx.service.requestReset({ email: "an@example.com" });
  assert.ok(
    ctx.mailer.sent[0]!.resetUrl.startsWith(
      "https://web.brewlite.vn/reset-password#token=",
    ),
  );
  process.env.PASSWORD_RESET_BASE_URL =
    "https://quen-mat-khau.example.com/duong/dan";
  ctx = setup();
  await ctx.service.requestReset({ email: "an@example.com" });
  assert.ok(
    ctx.mailer.sent[0]!.resetUrl.startsWith(
      "https://quen-mat-khau.example.com/reset-password#token=",
    ),
  );
  delete process.env.PASSWORD_RESET_BASE_URL;
  delete process.env.FRONTEND_ORIGIN;
});
test("cấu hình sai là lỗi 503 chứ không phải 500 hay gửi liên kết hỏng", async () => {
  process.env.PASSWORD_RESET_EXPIRES_IN_MINUTES = "0";
  await expectHttp(
    () => setup().service.requestReset({ email: "an@example.com" }),
    503,
  );
  delete process.env.PASSWORD_RESET_EXPIRES_IN_MINUTES;
  for (const [key, value] of [
    ["PASSWORD_RESET_EXPIRES_IN_MINUTES", "abc"],
    ["PASSWORD_RESET_EXPIRES_IN_MINUTES", "99999"],
    ["PASSWORD_RESET_BASE_URL", "khong-phai-url"],
    ["PASSWORD_RESET_BASE_URL", "ftp://x.y"],
  ] as const) {
    process.env[key] = value;
    assert.throws(
      () => passwordResetConfig(),
      ConfigurationError,
      `${key}=${value}`,
    );
    delete process.env[key];
  }
  assert.deepEqual(passwordResetConfig(), {
    ttlMinutes: 30,
    webBaseUrl: "http://localhost:3000",
  });
});
test("đặt lại mật khẩu: token sai dạng, token không có thật và mật khẩu yếu bị từ chối đúng mã lỗi", async () => {
  const ctx = setup();
  await expectHttp(
    () =>
      ctx.service.resetPassword({ token: "ngan", password: "Mat-khau-moi-1" }),
    400,
    "RESET_TOKEN_INVALID",
  );
  assert.equal(ctx.users.resets.length, 0, "token sai dạng không được chạm DB");
  await expectHttp(
    () => ctx.service.resetPassword({ token: "A".repeat(43), password: "yeu" }),
    400,
    "VALIDATION_FAILED",
  );
  assert.equal(ctx.users.resets.length, 0);
  ctx.users.allowReset = false;
  await expectHttp(
    () =>
      ctx.service.resetPassword({
        token: "A".repeat(43),
        password: "Mat-khau-moi-1",
      }),
    400,
    "RESET_TOKEN_INVALID",
  );
});
test("đặt lại mật khẩu thành công: gửi xuống DB mã băm token và hash bcrypt, không bao giờ gửi mật khẩu thô", async () => {
  const ctx = setup();
  const token = "B".repeat(43);
  assert.deepEqual(
    await ctx.service.resetPassword({ token, password: "Mat-khau-moi-1" }),
    { message: RESET_PASSWORD_MESSAGE },
  );
  const call = ctx.users.resets[0]!;
  assert.equal(call.tokenHash, sha256(token));
  assert.match(call.passwordHash, /^\$2[aby]\$\d\d\$/);
  assert.notEqual(call.passwordHash, "Mat-khau-moi-1");
});
test("cấu hình SMTP: không có host thì không gửi thật; port sai bị từ chối", () => {
  assert.deepEqual(mailConfig(), {
    from: "BrewLite <no-reply@brewlite.local>",
  });
  process.env.SMTP_HOST = "smtp.example.com";
  process.env.SMTP_SECURE = "TRUE";
  process.env.SMTP_USER = "u";
  process.env.SMTP_PASS = "p";
  assert.deepEqual(mailConfig().smtp, {
    host: "smtp.example.com",
    port: 587,
    secure: true,
    user: "u",
    pass: "p",
  });
  process.env.SMTP_PORT = "99999";
  assert.throws(() => mailConfig(), ConfigurationError);
  delete process.env.SMTP_PORT;
  assert.ok(createMailer() instanceof SmtpMailer);
  for (const key of ["SMTP_HOST", "SMTP_SECURE", "SMTP_USER", "SMTP_PASS"])
    delete process.env[key];
  assert.ok(createMailer() instanceof ConsoleMailer);
});
test("ConsoleMailer: in liên kết khi phát triển, tuyệt đối không in liên kết khi production", async () => {
  const lines: string[] = [];
  const mailer = new ConsoleMailer();
  (mailer as unknown as { logger: object }).logger = {
    log: (m: string) => lines.push(`log ${m}`),
    warn: (m: string) => lines.push(`warn ${m}`),
  };
  const mail = {
    to: "an@example.com",
    resetUrl: "http://localhost:3000/reset-password#token=SECRET",
    expiresInMinutes: 30,
  };
  await mailer.sendPasswordReset(mail);
  assert.ok(
    lines.some((l) => l.startsWith("log ") && l.includes("#token=SECRET")),
  );
  lines.length = 0;
  process.env.NODE_ENV = "production";
  await mailer.sendPasswordReset(mail);
  delete process.env.NODE_ENV;
  assert.equal(lines.length, 1);
  assert.ok(lines[0]!.startsWith("warn "));
  assert.equal(lines.join("\n").includes("SECRET"), false);
  assert.equal(lines.join("\n").includes("an@example.com"), false);
});
test("SmtpMailer: soạn thư văn bản thuần có liên kết, có/không có xác thực, và chặn chèn header", async () => {
  const sent: Record<string, unknown>[] = [];
  const created: Record<string, unknown>[] = [];
  const load = async () => ({
    createTransport: (options: Record<string, unknown>) => {
      created.push(options);
      return {
        sendMail: async (message: Record<string, unknown>) => {
          sent.push(message);
        },
      };
    },
  });
  const withAuth = new SmtpMailer(
    {
      from: "BrewLite <no-reply@x.vn>",
      smtp: { host: "h", port: 465, secure: true, user: "u", pass: "p" },
    },
    load as never,
  );
  await withAuth.sendPasswordReset({
    to: "an@example.com",
    resetUrl: "https://web/reset-password#token=T",
    expiresInMinutes: 30,
  });
  assert.deepEqual(created[0], {
    host: "h",
    port: 465,
    secure: true,
    auth: { user: "u", pass: "p" },
  });
  const message = sent[0]!;
  assert.equal(message.to, "an@example.com");
  assert.equal(message.from, "BrewLite <no-reply@x.vn>");
  assert.equal("html" in message, false, "chỉ gửi văn bản thuần");
  assert.ok(
    String(message.text).includes("https://web/reset-password#token=T"),
  );
  assert.ok(String(message.text).includes("30 phút"));
  const noAuth = new SmtpMailer(
    { from: "f", smtp: { host: "h", port: 25, secure: false } },
    load as never,
  );
  await noAuth.sendPasswordReset({
    to: "an@example.com",
    resetUrl: "u",
    expiresInMinutes: 5,
  });
  assert.equal(created[1]!.auth, undefined);
  await assert.rejects(
    noAuth.sendPasswordReset({
      to: "an@example.com\r\nBcc: ke-xau@x.com",
      resetUrl: "u",
      expiresInMinutes: 5,
    }),
  );
  assert.equal(sent.length, 2, "địa chỉ có xuống dòng không được gửi");
});
