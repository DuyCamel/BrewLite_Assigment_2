// TV3 — Test Auth không cần DB: UsersService dùng UserModel giả trong bộ nhớ; bcrypt và JWT là thư viện thật.
import "reflect-metadata";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { type ExecutionContext, HttpException } from "@nestjs/common";
import { compareSync } from "bcryptjs";
import jsonwebtoken from "jsonwebtoken";
import {
  extractBearerToken,
  JwtAuthGuard,
  type AuthenticatedRequest,
} from "../src/guards/jwt-auth.guard.js";
import type { UserModel } from "../src/models/user.model.js";
import {
  parseLoginInput,
  parseRegisterInput,
} from "../src/services/auth-validation.js";
import { authConfig, ConfigurationError } from "../src/config/environment.js";
const { sign } = jsonwebtoken;
import { AuthService } from "../src/services/auth.service.js";
import { UsersService } from "../src/services/users.service.js";
import type { PublicUser, UserRecord } from "../src/types/auth.types.js";
const SECRET = "test-secret-for-brewlite-auth-0123456789abcdef";
const PASSWORD = "BrewLite123!";
const savedEnv = {
  PRODUCT_DATA_SOURCE: process.env.PRODUCT_DATA_SOURCE,
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN_SECONDS: process.env.JWT_EXPIRES_IN_SECONDS,
};
before(() => {
  process.env.PRODUCT_DATA_SOURCE = "postgres";
  process.env.JWT_SECRET = SECRET;
  process.env.JWT_EXPIRES_IN_SECONDS = "3600";
});
after(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});
// UserModel giả: cùng chữ ký, email so khớp không phân biệt hoa thường và ném lỗi 23505 khi trùng như PostgreSQL.
class FakeUserModel {
  readonly rows: UserRecord[] = [];
  async findByEmail(email: string): Promise<UserRecord | null> {
    return (
      this.rows.find((r) => r.email.toLowerCase() === email.toLowerCase()) ??
      null
    );
  }
  async createUser(
    email: string,
    passwordHash: string,
    displayName: string = email.split("@")[0] ?? email,
  ): Promise<PublicUser> {
    if (await this.findByEmail(email))
      throw Object.assign(new Error("duplicate key value"), { code: "23505" });
    const row: UserRecord = {
      id: `user-${this.rows.length + 1}`,
      email,
      passwordHash,
      displayName,
      loyaltyPoints: 0,
    };
    this.rows.push(row);
    return { id: row.id, email, displayName, loyaltyPoints: 0 };
  }
  async findById(id: string): Promise<PublicUser | null> {
    const row = this.rows.find((r) => r.id === id);
    return row
      ? {
          id: row.id,
          email: row.email,
          displayName: row.displayName,
          loyaltyPoints: row.loyaltyPoints,
        }
      : null;
  }
}
function createServices() {
  const model = new FakeUserModel();
  const users = new UsersService(model as unknown as UserModel);
  return { model, users, auth: new AuthService(users) };
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
function fieldErrors(operation: () => unknown): Record<string, string> {
  try {
    operation();
  } catch (error) {
    assert.ok(error instanceof HttpException);
    assert.equal(error.getStatus(), 400);
    return (error.getResponse() as { errors: Record<string, string> }).errors;
  }
  throw new assert.AssertionError({ message: "đáng lẽ phải ném 400" });
}
test("đăng ký: chuẩn hóa email và bỏ qua trường lạ như role", () => {
  const input = parseRegisterInput({
    email: "  Khach@Example.COM ",
    password: PASSWORD,
    role: "ADMIN",
    loyaltyPoints: 999,
  });
  assert.deepEqual(input, { email: "khach@example.com", password: PASSWORD });
});
test("đăng ký: báo lỗi đúng từng trường", () => {
  assert.match(
    fieldErrors(() =>
      parseRegisterInput({ email: "khong-phai-email", password: PASSWORD }),
    ).email ?? "",
    /định dạng/,
  );
  const weak: [string, RegExp][] = [
    ["Ab1", /ít nhất 8/],
    ["chicochu", /chữ và số/],
    ["12345678", /chữ và số/],
    [`a1${"x".repeat(71)}`, /tối đa 72/],
  ];
  for (const [password, expected] of weak)
    assert.match(
      fieldErrors(() => parseRegisterInput({ email: "a@b.co", password }))
        .password ?? "",
      expected,
      password,
    );
  for (const body of [undefined, null, [], "x", 42]) {
    const errors = fieldErrors(() => parseRegisterInput(body));
    assert.ok(errors.email && errors.password, String(body));
  }
  assert.ok(
    fieldErrors(() => parseRegisterInput({ email: 1, password: 2 })).email,
  );
});
test("đăng nhập: bắt buộc email hợp lệ và mật khẩu không rỗng", () => {
  assert.deepEqual(parseLoginInput({ email: "A@B.co", password: "x" }), {
    email: "a@b.co",
    password: "x",
  });
  assert.ok(
    fieldErrors(() => parseLoginInput({ email: "", password: "" })).password,
  );
});
test("extractBearerToken chỉ nhận đúng dạng 'Bearer <token>'", () => {
  assert.equal(extractBearerToken("Bearer abc.def.ghi"), "abc.def.ghi");
  assert.equal(extractBearerToken("bearer abc"), "abc");
  for (const bad of [
    undefined,
    "",
    "Bearer",
    "Bearer a b",
    "Basic abc",
    ["Bearer x"],
  ])
    assert.equal(extractBearerToken(bad), null, String(bad));
});
test("đăng ký lưu hash bcrypt, không lưu mật khẩu thô và không trả passwordHash", async () => {
  const { auth, model } = createServices();
  const user = await auth.register({
    email: "An@Example.com",
    password: PASSWORD,
    role: "ADMIN",
  });
  assert.equal(user.email, "an@example.com");
  assert.equal(user.displayName, "an");
  assert.equal("passwordHash" in user, false);
  assert.equal("role" in user, false);
  const stored = model.rows[0];
  assert.ok(stored);
  assert.notEqual(stored.passwordHash, PASSWORD);
  assert.match(stored.passwordHash, /^\$2[aby]\$/);
  assert.ok(compareSync(PASSWORD, stored.passwordHash));
  assert.equal(JSON.stringify(user).includes(stored.passwordHash), false);
});
test("đăng ký email trùng (kể cả khác hoa thường) trả 409 EMAIL_TAKEN", async () => {
  const { auth } = createServices();
  await auth.register({ email: "an@example.com", password: PASSWORD });
  await expectHttp(
    () => auth.register({ email: "AN@example.com", password: PASSWORD }),
    409,
    "EMAIL_TAKEN",
  );
});
test("đăng nhập đúng cấp JWT xác thực được; response không lộ hash và không có role", async () => {
  const { auth } = createServices();
  const created = await auth.register({
    email: "an@example.com",
    password: PASSWORD,
  });
  const session = await auth.login({
    email: " AN@example.com ",
    password: PASSWORD,
  });
  assert.equal(session.tokenType, "Bearer");
  assert.equal(session.expiresIn, 3600);
  assert.deepEqual(session.user, created);
  assert.equal(JSON.stringify(session).includes("passwordHash"), false);
  assert.deepEqual(auth.verifyAccessToken(session.accessToken), {
    id: created.id,
    email: "an@example.com",
  });
  const payload = JSON.parse(
    Buffer.from(session.accessToken.split(".")[1] ?? "", "base64url").toString(
      "utf8",
    ),
  );
  assert.equal("role" in payload, false);
  assert.equal(typeof payload.exp, "number");
});
test("sai mật khẩu và email không tồn tại cho cùng một thông báo 401", async () => {
  const { auth } = createServices();
  await auth.register({ email: "an@example.com", password: PASSWORD });
  const messages: unknown[] = [];
  for (const body of [
    { email: "an@example.com", password: "SaiMatKhau1" },
    { email: "khongco@example.com", password: PASSWORD },
  ])
    await assert.rejects(auth.login(body), (error: unknown) => {
      assert.ok(error instanceof HttpException);
      assert.equal(error.getStatus(), 401);
      const response = error.getResponse() as { code: string; message: string };
      assert.equal(response.code, "INVALID_CREDENTIALS");
      messages.push(response.message);
      return true;
    });
  assert.equal(messages[0], messages[1]);
});
test("verifyAccessToken từ chối token thiếu, rác, hết hạn, sai khóa, alg none, thiếu claim", async () => {
  const { auth } = createServices();
  const now = Math.floor(Date.now() / 1000);
  const claims = { email: "an@example.com" };
  const unsigned = (payload: object) =>
    [{ alg: "none", typ: "JWT" }, payload]
      .map((part) => Buffer.from(JSON.stringify(part)).toString("base64url"))
      .join(".") + ".";
  const cases: [string, string, string][] = [
    ["thiếu", "", "TOKEN_MISSING"],
    ["rác", "khong.phai.jwt", "TOKEN_INVALID"],
    [
      "hết hạn",
      sign({ ...claims, exp: now - 10 }, SECRET, { subject: "u1" }),
      "TOKEN_EXPIRED",
    ],
    [
      "sai khóa",
      sign(claims, "khoa-khac-".padEnd(40, "y"), {
        subject: "u1",
        expiresIn: 60,
      }),
      "TOKEN_INVALID",
    ],
    [
      "alg none",
      unsigned({ ...claims, sub: "u1", exp: now + 60 }),
      "TOKEN_INVALID",
    ],
    [
      "thiếu email",
      sign({}, SECRET, { subject: "u1", expiresIn: 60 }),
      "TOKEN_INVALID",
    ],
    ["thiếu sub", sign(claims, SECRET, { expiresIn: 60 }), "TOKEN_INVALID"],
    ["thiếu exp", sign(claims, SECRET, { subject: "u1" }), "TOKEN_INVALID"],
  ];
  for (const [name, token, code] of cases)
    await expectHttp(() => auth.verifyAccessToken(token), 401, code).catch(
      (error: unknown) => {
        throw new Error(`Ca "${name}": ${String(error)}`);
      },
    );
});
test("thiếu JWT_SECRET là lỗi cấu hình 503, không phải 401", async () => {
  const { auth } = createServices();
  delete process.env.JWT_SECRET;
  try {
    await expectHttp(() => auth.verifyAccessToken("a.b.c"), 503);
  } finally {
    process.env.JWT_SECRET = SECRET;
  }
});
test("JwtAuthGuard gắn user vào request khi token hợp lệ và trả 401 khi không", async () => {
  const { auth } = createServices();
  const guard = new JwtAuthGuard(auth);
  // Chỉ dựng phần ExecutionContext mà guard dùng; ExecutionContext thật có nhiều thành viên khác.
  const contextFor = (request: AuthenticatedRequest) =>
    ({
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({}),
      }),
    }) as unknown as ExecutionContext;
  const valid = sign({ email: "an@example.com" }, SECRET, {
    subject: "u1",
    expiresIn: 60,
  });
  const request: AuthenticatedRequest = {
    headers: { authorization: `bearer ${valid}` },
  };
  assert.equal(guard.canActivate(contextFor(request)), true);
  assert.deepEqual(request.user, { id: "u1", email: "an@example.com" });
  for (const [headers, code] of [
    [{}, "TOKEN_MISSING"],
    [{ authorization: "Basic dXNlcjpwYXNz" }, "TOKEN_MISSING"],
    [{ authorization: "Bearer rac" }, "TOKEN_INVALID"],
  ] as const)
    await expectHttp(
      () => guard.canActivate(contextFor({ headers: { ...headers } })),
      401,
      code,
    );
});
test("UsersService từ chối ở sample mode, che lỗi DB và trả 404 khi không có user", async () => {
  const { users } = createServices();
  process.env.PRODUCT_DATA_SOURCE = "sample";
  try {
    await expectHttp(() => users.findByEmail("a@b.co"), 503);
    await expectHttp(() => users.createUser("a@b.co", "hash"), 503);
    await expectHttp(() => users.getCurrentUser("u1"), 503);
  } finally {
    process.env.PRODUCT_DATA_SOURCE = "postgres";
  }
  const broken = new UsersService({
    findByEmail: async () => {
      throw new Error("password authentication failed for user brewlite");
    },
  } as unknown as UserModel);
  await assert.rejects(broken.findByEmail("a@b.co"), (error: unknown) => {
    assert.ok(error instanceof HttpException);
    assert.equal(error.getStatus(), 503);
    assert.equal(
      JSON.stringify(error.getResponse()).includes("brewlite"),
      false,
    );
    return true;
  });
  await expectHttp(() => users.getCurrentUser("khong-co"), 404);
});
test("authConfig: từ chối secret ngắn, chuỗi mẫu cũ và secret mẫu local khi chạy production", () => {
  const saved = {
    NODE_ENV: process.env.NODE_ENV,
    JWT_SECRET: process.env.JWT_SECRET,
    TTL: process.env.JWT_EXPIRES_IN_SECONDS,
  };
  const restore = (key: string, value: string | undefined) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };
  const rejects = (secret: string) => {
    process.env.JWT_SECRET = secret;
    assert.throws(() => authConfig(), ConfigurationError, secret);
  };
  try {
    delete process.env.JWT_EXPIRES_IN_SECONDS;
    delete process.env.NODE_ENV;
    rejects("ngan");
    rejects("replace_before_implementing_auth"); // chuỗi mẫu cũ trong .env_vidu dài đúng 32 ký tự
    const local = "brewlite_local_only_jwt_secret_change_before_deploy";
    process.env.JWT_SECRET = local;
    assert.equal(authConfig().jwtSecret, local); // máy local được dùng secret mẫu
    process.env.NODE_ENV = "production";
    rejects(local); // production thì không
    process.env.JWT_SECRET = "x".repeat(48);
    assert.equal(authConfig().accessTokenTtlSeconds, 3600);
    for (const ttl of ["59", "abc", "1.5", "99999999"]) {
      process.env.JWT_EXPIRES_IN_SECONDS = ttl;
      assert.throws(() => authConfig(), ConfigurationError, ttl);
    }
    process.env.JWT_EXPIRES_IN_SECONDS = "900";
    assert.equal(authConfig().accessTokenTtlSeconds, 900);
  } finally {
    restore("NODE_ENV", saved.NODE_ENV);
    restore("JWT_SECRET", saved.JWT_SECRET);
    restore("JWT_EXPIRES_IN_SECONDS", saved.TTL);
  }
});
