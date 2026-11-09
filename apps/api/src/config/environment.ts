// TV3 — Nạp duy nhất .env tại gốc repo; process env được ưu tiên hơn file. Cấu hình Auth (JWT) cũng đặt ở đây.
import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../../.env"), quiet: true });
// Lỗi cấu hình có thông điệp an toàn để in ra console (không chứa giá trị bí mật).
export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}
export function dataSource(): "postgres" | "sample" {
  const value = process.env.PRODUCT_DATA_SOURCE ?? "postgres";
  if (value !== "postgres" && value !== "sample")
    throw new ConfigurationError(
      "PRODUCT_DATA_SOURCE phải là postgres hoặc sample",
    );
  return value;
}
export function paymentLifetimes(): {
  orderMinutes: number;
  qrMinutes: number;
} {
  const orderMinutes = Number(process.env.ORDER_TTL_MINUTES ?? "15");
  const qrMinutes = Number(process.env.QR_TTL_MINUTES ?? "5");
  if (
    !Number.isFinite(qrMinutes) ||
    qrMinutes < 0.5 ||
    qrMinutes > 1440 ||
    !Number.isFinite(orderMinutes) ||
    orderMinutes < 2 * qrMinutes ||
    orderMinutes > 10080
  ) {
    throw new ConfigurationError(
      "ORDER_TTL_MINUTES phải ít nhất gấp đôi QR_TTL_MINUTES; thời gian QR tối thiểu 0.5 phút và cả hai phải là số phút hợp lệ",
    );
  }
  return { orderMinutes, qrMinutes };
}
export interface AuthConfig {
  jwtSecret: string;
  accessTokenTtlSeconds: number;
}
const JWT_SECRET_MIN_LENGTH = 32;
// Giá trị mẫu trong .env_vidu: "replace_" là chuỗi cũ (luôn bị từ chối, phải đặt secret thật);
// "local_only" chỉ dùng cho máy local và bị từ chối khi NODE_ENV=production.
const STALE_SECRET_MARKER = "replace_";
const LOCAL_SECRET_MARKER = "local_only";
export function usesLocalSampleJwtSecret(): boolean {
  return (process.env.JWT_SECRET ?? "").includes(LOCAL_SECRET_MARKER);
}
const TOKEN_TTL_MIN_SECONDS = 60;
const TOKEN_TTL_MAX_SECONDS = 60 * 60 * 24 * 30;
// Đọc lười (khi dùng) để test/sample mode không bắt buộc có JWT_SECRET; main.ts gọi sớm để dừng nếu thiếu.
export function authConfig(): AuthConfig {
  const jwtSecret = process.env.JWT_SECRET ?? "";
  if (jwtSecret.length < JWT_SECRET_MIN_LENGTH)
    throw new ConfigurationError(
      `JWT_SECRET phải có ít nhất ${JWT_SECRET_MIN_LENGTH} ký tự. Tạo bằng: node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`,
    );
  if (jwtSecret.includes(STALE_SECRET_MARKER))
    throw new ConfigurationError(
      "JWT_SECRET đang là chuỗi mẫu cũ. Lấy JWT_SECRET mới từ .env_vidu hoặc tạo secret riêng.",
    );
  if (process.env.NODE_ENV === "production" && usesLocalSampleJwtSecret())
    throw new ConfigurationError(
      "JWT_SECRET đang là giá trị mẫu của máy local. Production phải đặt secret riêng, ngẫu nhiên.",
    );
  const ttl = Number(process.env.JWT_EXPIRES_IN_SECONDS ?? "3600");
  if (
    !Number.isInteger(ttl) ||
    ttl < TOKEN_TTL_MIN_SECONDS ||
    ttl > TOKEN_TTL_MAX_SECONDS
  )
    throw new ConfigurationError(
      `JWT_EXPIRES_IN_SECONDS phải là số nguyên giây từ ${TOKEN_TTL_MIN_SECONDS} đến ${TOKEN_TTL_MAX_SECONDS}`,
    );
  return { jwtSecret, accessTokenTtlSeconds: ttl };
}
export interface PasswordResetConfig {
  ttlMinutes: number;
  webBaseUrl: string;
}
const RESET_TTL_MIN_MINUTES = 5;
const RESET_TTL_MAX_MINUTES = 24 * 60;
// Địa chỉ web trong liên kết email lấy từ cấu hình, KHÔNG lấy từ header của request (chống giả mạo Host).
export function passwordResetConfig(): PasswordResetConfig {
  const ttl = Number(process.env.PASSWORD_RESET_EXPIRES_IN_MINUTES ?? "30");
  if (
    !Number.isInteger(ttl) ||
    ttl < RESET_TTL_MIN_MINUTES ||
    ttl > RESET_TTL_MAX_MINUTES
  )
    throw new ConfigurationError(
      `PASSWORD_RESET_EXPIRES_IN_MINUTES phải là số nguyên phút từ ${RESET_TTL_MIN_MINUTES} đến ${RESET_TTL_MAX_MINUTES}`,
    );
  const raw =
    process.env.PASSWORD_RESET_BASE_URL?.trim() ||
    (process.env.FRONTEND_ORIGIN ?? "http://localhost:3000")
      .split(",")[0]
      ?.trim() ||
    "http://localhost:3000";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ConfigurationError(
      "PASSWORD_RESET_BASE_URL (hoặc FRONTEND_ORIGIN) không phải địa chỉ hợp lệ",
    );
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new ConfigurationError(
      "PASSWORD_RESET_BASE_URL phải bắt đầu bằng http:// hoặc https://",
    );
  return { ttlMinutes: ttl, webBaseUrl: url.origin };
}
export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
}
export interface MailConfig {
  from: string;
  smtp?: SmtpConfig;
}
// Không có SMTP_HOST thì không gửi email thật (ConsoleMailer: chỉ in liên kết ở môi trường phát triển).
export function mailConfig(): MailConfig {
  const from =
    process.env.MAIL_FROM?.trim() || "BrewLite <no-reply@brewlite.local>";
  const host = process.env.SMTP_HOST?.trim();
  if (!host) return { from };
  const port = Number(process.env.SMTP_PORT ?? "587");
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new ConfigurationError(
      "SMTP_PORT phải là số cổng hợp lệ (1 đến 65535)",
    );
  return {
    from,
    smtp: {
      host,
      port,
      secure: (process.env.SMTP_SECURE ?? "").toLowerCase() === "true",
      user: process.env.SMTP_USER?.trim() || undefined,
      pass: process.env.SMTP_PASS || undefined,
    },
  };
}
