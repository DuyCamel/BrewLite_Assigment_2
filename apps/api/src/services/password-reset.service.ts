// LOGIC NGHIỆP VỤ tại service này. Gọi UsersService (và qua đó UserModel) để truy cập SQL.
// TV3 — Quên mật khẩu: POST /auth/forgot-password và POST /auth/reset-password.
import { createHash, randomBytes } from "node:crypto";
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { hash } from "bcryptjs";
import {
  ConfigurationError,
  passwordResetConfig,
  type PasswordResetConfig,
} from "../config/environment.js";
import {
  parseForgotPasswordInput,
  parseResetPasswordInput,
  RESET_TOKEN_PATTERN,
} from "./auth-validation.js";
import { BCRYPT_ROUNDS } from "./auth.service.js";
import { Mailer } from "./mailer.js";
import { UsersService } from "./users.service.js";
// Luôn trả đúng một thông báo này dù email có tồn tại hay không, để không lộ email nào đã đăng ký.
export const FORGOT_PASSWORD_MESSAGE =
  "Nếu email này đã đăng ký, chúng tôi đã gửi hướng dẫn đặt lại mật khẩu. Hãy kiểm tra hộp thư (cả thư rác).";
export const RESET_PASSWORD_MESSAGE =
  "Đã đặt lại mật khẩu. Hãy đăng nhập bằng mật khẩu mới.";
// DB chỉ lưu mã băm; token gốc chỉ có trong email. Token ngẫu nhiên 256 bit nên SHA-256 là đủ (không cần bcrypt).
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
function invalidTokenError() {
  return new BadRequestException({
    statusCode: 400,
    code: "RESET_TOKEN_INVALID",
    message:
      "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn. Hãy yêu cầu liên kết mới.",
  });
}
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);
  constructor(
    @Inject(UsersService) private readonly users: UsersService,
    @Inject(Mailer) private readonly mailer: Mailer,
  ) {}
  async requestReset(input: unknown): Promise<{ message: string }> {
    const { email } = parseForgotPasswordInput(input);
    const user = await this.users.findByEmail(email);
    if (user) {
      const { ttlMinutes, webBaseUrl } = this.config();
      const token = randomBytes(32).toString("base64url");
      const created = await this.users.createPasswordResetToken(
        user.id,
        hashToken(token),
        ttlMinutes * 60,
      );
      // Token nằm sau dấu # nên trình duyệt không gửi nó lên máy chủ web hay header Referer.
      if (created)
        void this.deliver(
          user.email,
          `${webBaseUrl}/reset-password#token=${token}`,
          ttlMinutes,
        );
    }
    return { message: FORGOT_PASSWORD_MESSAGE };
  }
  async resetPassword(input: unknown): Promise<{ message: string }> {
    const { token, password } = parseResetPasswordInput(input);
    if (!RESET_TOKEN_PATTERN.test(token)) throw invalidTokenError();
    const passwordHash = await hash(password, BCRYPT_ROUNDS);
    const changed = await this.users.resetPasswordWithToken(
      hashToken(token),
      passwordHash,
    );
    if (!changed) throw invalidTokenError();
    return { message: RESET_PASSWORD_MESSAGE };
  }
  // Gửi email không chặn phản hồi, và lỗi gửi không làm lộ việc email có tồn tại hay không.
  private deliver(
    to: string,
    resetUrl: string,
    expiresInMinutes: number,
  ): Promise<void> {
    return this.mailer
      .sendPasswordReset({ to, resetUrl, expiresInMinutes })
      .catch((error: unknown) => {
        this.logger.error(
          `Không gửi được email đặt lại mật khẩu: ${error instanceof Error ? error.message : "lỗi không xác định"}`,
        );
      });
  }
  private config(): PasswordResetConfig {
    try {
      return passwordResetConfig();
    } catch (error) {
      if (error instanceof ConfigurationError) {
        this.logger.error(error.message);
        throw new ServiceUnavailableException(
          "Máy chủ chưa cấu hình chức năng quên mật khẩu. Liên hệ người quản trị.",
        );
      }
      throw error;
    }
  }
}
