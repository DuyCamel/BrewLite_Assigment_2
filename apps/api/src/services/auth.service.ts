// LOGIC NGHIỆP VỤ tại service này. Gọi UsersService (và qua đó UserModel) để truy cập SQL.
// Thành viên 3 — Auth: đăng ký, đăng nhập (bcrypt + JWT HS256) và xác thực access token cho guard.
import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { compare, hash } from "bcryptjs";
import jsonwebtoken from "jsonwebtoken";
import type { JwtPayload } from "jsonwebtoken";
import {
  authConfig,
  ConfigurationError,
  type AuthConfig,
} from "../config/environment.js";
import type {
  AuthErrorCode,
  AuthenticatedUser,
  AuthSession,
  PublicUser,
} from "../types/auth.types.js";
import { parseLoginInput, parseRegisterInput } from "./auth-validation.js";
import { UsersService } from "./users.service.js";
export const BCRYPT_ROUNDS = 10;
const { sign, TokenExpiredError, verify } = jsonwebtoken;
// Dùng chung một thông báo cho "sai email" và "sai mật khẩu" để không lộ email nào đã đăng ký.
const INVALID_CREDENTIALS_MESSAGE = "Email hoặc mật khẩu không đúng.";
function unauthorized(code: AuthErrorCode, message: string) {
  return new UnauthorizedException({ statusCode: 401, code, message });
}
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private dummyHash?: Promise<string>;
  constructor(@Inject(UsersService) private readonly users: UsersService) {}
  // POST /auth/register: validate, bcrypt, email duy nhất (DB là nguồn sự thật, trùng -> 409). Không nhận role từ client.
  async register(input: unknown): Promise<PublicUser> {
    const { email, password } = parseRegisterInput(input);
    const passwordHash = await hash(password, BCRYPT_ROUNDS);
    return this.users.createUser(email, passwordHash);
  }
  // POST /auth/login: so khớp bcrypt, cấp JWT. Không trả passwordHash.
  async login(input: unknown): Promise<AuthSession> {
    const { email, password } = parseLoginInput(input);
    const user = await this.users.findByEmail(email);
    // Luôn chạy một lần bcrypt, kể cả khi email không tồn tại, để thời gian phản hồi không lộ email.
    const matches = await compare(
      password,
      user?.passwordHash ?? (await this.getDummyHash()),
    );
    if (!user || !matches)
      throw unauthorized("INVALID_CREDENTIALS", INVALID_CREDENTIALS_MESSAGE);
    const { jwtSecret, accessTokenTtlSeconds } = this.config();
    const accessToken = sign({ email: user.email }, jwtSecret, {
      algorithm: "HS256",
      subject: user.id,
      expiresIn: accessTokenTtlSeconds,
    });
    return {
      accessToken,
      tokenType: "Bearer",
      expiresIn: accessTokenTtlSeconds,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        loyaltyPoints: user.loyaltyPoints,
      },
    };
  }
  // Dùng cho JwtAuthGuard: từ chối token thiếu/sai/hết hạn bằng 401 (mã lỗi phân biệt TOKEN_EXPIRED để web đưa về /login).
  verifyAccessToken(token: string): AuthenticatedUser {
    if (!token)
      throw unauthorized("TOKEN_MISSING", "Cần đăng nhập để tiếp tục.");
    const { jwtSecret } = this.config();
    let decoded: unknown;
    try {
      // Chốt thuật toán để chặn tấn công đổi alg (vd "none").
      decoded = verify(token, jwtSecret, { algorithms: ["HS256"] });
    } catch (error) {
      if (error instanceof TokenExpiredError)
        throw unauthorized(
          "TOKEN_EXPIRED",
          "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
        );
      throw unauthorized(
        "TOKEN_INVALID",
        "Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.",
      );
    }
    const payload =
      typeof decoded === "object" && decoded !== null
        ? (decoded as JwtPayload)
        : null;
    if (
      !payload ||
      typeof payload.sub !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.exp !== "number"
    )
      throw unauthorized(
        "TOKEN_INVALID",
        "Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.",
      );
    return { id: payload.sub, email: payload.email };
  }
  private config(): AuthConfig {
    try {
      return authConfig();
    } catch (error) {
      if (error instanceof ConfigurationError) {
        this.logger.error(error.message);
        throw new ServiceUnavailableException(
          "Máy chủ chưa cấu hình xác thực. Liên hệ người quản trị.",
        );
      }
      throw error;
    }
  }
  private getDummyHash(): Promise<string> {
    this.dummyHash ??= hash("brewlite-dummy-password", BCRYPT_ROUNDS);
    return this.dummyHash;
  }
}
