// TV3 — Gửi email. Service chỉ biết giao diện Mailer; cách gửi thật được chọn bằng cấu hình (createMailer).
import { Logger } from "@nestjs/common";
import {
  ConfigurationError,
  mailConfig,
  type MailConfig,
  type SmtpConfig,
} from "../config/environment";
export interface PasswordResetMail {
  to: string;
  resetUrl: string;
  expiresInMinutes: number;
}
// Lớp trừu tượng dùng làm token DI: @Inject(Mailer).
export abstract class Mailer {
  abstract sendPasswordReset(mail: PasswordResetMail): Promise<void>;
}
// Phát triển: in liên kết ra console để thử mà không cần máy chủ email.
// Production không bao giờ in liên kết vào log (ai đọc được log sẽ chiếm được tài khoản).
export class ConsoleMailer extends Mailer {
  private readonly logger = new Logger(ConsoleMailer.name);
  async sendPasswordReset({
    to,
    resetUrl,
    expiresInMinutes,
  }: PasswordResetMail) {
    if (process.env.NODE_ENV === "production") {
      this.logger.warn(
        "Chưa cấu hình SMTP_HOST: không gửi được email đặt lại mật khẩu.",
      );
      return;
    }
    this.logger.log(
      `[DEV] Liên kết đặt lại mật khẩu cho ${to} (hết hạn sau ${expiresInMinutes} phút): ${resetUrl}`,
    );
  }
}
interface MailMessage {
  from: string;
  to: string;
  subject: string;
  text: string;
}
interface Transport {
  sendMail(message: MailMessage): Promise<unknown>;
}
type Nodemailer = {
  createTransport(options: {
    host: string;
    port: number;
    secure: boolean;
    auth?: { user: string; pass: string };
  }): Transport;
};
// nodemailer là tùy chọn: chỉ cần cài khi bật SMTP (npm install nodemailer -w backend).
// Tên module đặt trong biến để TypeScript không đòi gói phải có sẵn lúc biên dịch.
async function loadNodemailer(): Promise<Nodemailer> {
  const name = "nodemailer";
  try {
    return (await import(name)) as Nodemailer;
  } catch {
    throw new ConfigurationError(
      "Đã cấu hình SMTP_HOST nhưng chưa cài nodemailer. Chạy: npm install nodemailer -w backend",
    );
  }
}
export class SmtpMailer extends Mailer {
  constructor(
    private readonly config: { from: string; smtp: SmtpConfig },
    private readonly load: () => Promise<Nodemailer> = loadNodemailer,
  ) {
    super();
  }
  async sendPasswordReset({
    to,
    resetUrl,
    expiresInMinutes,
  }: PasswordResetMail) {
    // Chặn chèn thêm header email qua xuống dòng (địa chỉ đã được kiểm tra, đây là lớp phòng thủ thứ hai).
    if (/[\r\n]/.test(to)) throw new Error("Địa chỉ email không hợp lệ");
    const { smtp, from } = this.config;
    const transport = (await this.load()).createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth:
        smtp.user && smtp.pass
          ? { user: smtp.user, pass: smtp.pass }
          : undefined,
    });
    await transport.sendMail({
      from,
      to,
      subject: "Đặt lại mật khẩu BrewLite",
      // Chỉ gửi văn bản thuần, không HTML, nên không có chỗ để chèn mã độc vào nội dung.
      text: [
        "Chào bạn,",
        "",
        "Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản BrewLite của bạn.",
        `Mở liên kết sau trong ${expiresInMinutes} phút để đặt mật khẩu mới (chỉ dùng được một lần):`,
        "",
        resetUrl,
        "",
        "Nếu bạn không yêu cầu, hãy bỏ qua email này; mật khẩu của bạn không thay đổi.",
      ].join("\n"),
    });
  }
}
export function createMailer(config: MailConfig = mailConfig()): Mailer {
  return config.smtp
    ? new SmtpMailer({ from: config.from, smtp: config.smtp })
    : new ConsoleMailer();
}
