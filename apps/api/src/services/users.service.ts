// LOGIC NGHIỆP VỤ tại service này. Gọi UserModel trong src/models để truy cập SQL.
// Thành viên 3 — Users. Cửa duy nhất để các service khác đọc/ghi tài khoản; lỗi DB đổi thành 503, không lộ chi tiết kết nối.
import {
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { isUniqueViolation } from "../models/db-errors.js";
import { dataSource } from "../config/environment.js";
import { UserModel } from "../models/user.model.js";
import type { PublicUser, UserRecord } from "../types/auth.types.js";
@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  constructor(@Inject(UserModel) private readonly model: UserModel) {}
  // Nội bộ cho AuthService: kết quả có passwordHash nên KHÔNG được trả thẳng ra controller.
  findByEmail(email: string): Promise<UserRecord | null> {
    return this.run(() => this.model.findByEmail(email));
  }
  createUser(email: string, passwordHash: string): Promise<PublicUser> {
    return this.run(async () => {
      try {
        return await this.model.createUser(email, passwordHash);
      } catch (error) {
        if (isUniqueViolation(error))
          throw new ConflictException({
            statusCode: 409,
            code: "EMAIL_TAKEN",
            message:
              "Email này đã được đăng ký. Hãy đăng nhập hoặc dùng email khác.",
            errors: { email: "Email này đã được đăng ký." },
          });
        throw error;
      }
    });
  }
  createPasswordResetToken(
    userId: string,
    tokenHash: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    return this.run(() =>
      this.model.createPasswordResetToken(userId, tokenHash, ttlSeconds),
    );
  }
  resetPasswordWithToken(
    tokenHash: string,
    passwordHash: string,
  ): Promise<boolean> {
    return this.run(() =>
      this.model.resetPasswordWithToken(tokenHash, passwordHash),
    );
  }
  // Trang tài khoản/GET /auth/me: chỉ đọc user từ id trong JWT đã xác thực.
  async getCurrentUser(userId: string): Promise<PublicUser> {
    const user = await this.run(() => this.model.findById(userId));
    if (!user)
      throw new NotFoundException("Không tìm thấy tài khoản của phiên này.");
    return user;
  }
  private async run<T>(operation: () => Promise<T>): Promise<T> {
    // Sample mode không có DB: từ chối rõ ràng, không giả lập tài khoản.
    if (dataSource() === "sample")
      throw new ServiceUnavailableException(
        "Tài khoản cần PostgreSQL. API đang chạy với PRODUCT_DATA_SOURCE=sample.",
      );
    try {
      return await operation();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(
        error instanceof Error ? error.message : "Lỗi không xác định",
      );
      throw new ServiceUnavailableException(
        "Không truy cập được dữ liệu tài khoản. Thử lại sau ít phút.",
      );
    }
  }
}
