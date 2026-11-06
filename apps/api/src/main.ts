// TV3 — Bootstrap/CORS/env dùng chung; phối hợp TV1 khi chạy Docker local và TV6 khi triển khai production.
import "reflect-metadata";
import {
  authConfig,
  ConfigurationError,
  dataSource,
  mailConfig,
  passwordResetConfig,
  usesLocalSampleJwtSecret,
} from "./config/environment.js";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
// FRONTEND_ORIGIN nhận một hoặc nhiều origin, ngăn cách bằng dấu phẩy.
function allowedOrigins(): string[] {
  return (process.env.FRONTEND_ORIGIN ?? "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}
async function bootstrap() {
  // Dừng ngay nếu thiếu JWT_SECRET thay vì để lỗi lộ ra ở request đăng nhập đầu tiên.
  if (dataSource() === "postgres") {
    authConfig();
    passwordResetConfig();
    if (!mailConfig().smtp)
      console.warn(
        process.env.NODE_ENV === "production"
          ? "Cảnh báo: chưa cấu hình SMTP_HOST nên không gửi được email quên mật khẩu."
          : "Quên mật khẩu: chưa cấu hình SMTP_HOST, liên kết đặt lại mật khẩu sẽ được in ra console này.",
      );
    if (usesLocalSampleJwtSecret())
      console.warn(
        "Cảnh báo: JWT_SECRET đang là giá trị mẫu, chỉ dùng trên máy local. Không triển khai với giá trị này.",
      );
  }
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: allowedOrigins() });
  app.enableShutdownHooks();
  await app.listen(Number(process.env.API_PORT ?? 4000), "0.0.0.0");
}
bootstrap().catch((error: unknown) => {
  // Chỉ in nguyên văn lỗi cấu hình (an toàn); các lỗi khác giữ thông báo chung để không lộ chi tiết kết nối.
  console.error(
    error instanceof ConfigurationError
      ? error.message
      : "Không khởi động được API. Kiểm tra cấu hình môi trường.",
  );
  process.exitCode = 1;
});
