// TV3 — Model User: NƠI VIẾT SQL, không đặt logic giao diện/HTTP tại đây.
// SQL luôn dùng tham số $1, $2...; chỉ findByEmail trả passwordHash (cho AuthService), các hàm còn lại không bao giờ SELECT password_hash.
import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { DatabaseService } from "../config/db.js";
import type { PublicUser, UserRecord } from "../types/auth.types.js";
interface PublicUserRow {
  id: string;
  email: string;
  displayName: string;
  // pg trả bigint/numeric dưới dạng chuỗi; ép về number ở toPublicUser.
  loyaltyPoints: number | string;
}
interface UserRow extends PublicUserRow {
  passwordHash: string;
}
const PUBLIC_COLUMNS = `id, email, display_name AS "displayName", loyalty_points AS "loyaltyPoints"`;
function toPublicUser(row: PublicUserRow): PublicUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    loyaltyPoints: Number(row.loyaltyPoints),
  };
}
@Injectable()
export class UserModel {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}
  // Email so khớp không phân biệt hoa thường, cùng quy tắc với ràng buộc UNIQUE trong schema.
  async findByEmail(email: string): Promise<UserRecord | null> {
    const result = await this.db.query<UserRow>(
      `SELECT ${PUBLIC_COLUMNS}, password_hash AS "passwordHash"
       FROM users WHERE lower(email) = lower($1) LIMIT 1`,
      [email],
    );
    const row = result.rows[0];
    return row
      ? { ...toPublicUser(row), passwordHash: row.passwordHash }
      : null;
  }
  // Nhận hash từ AuthService (không bao giờ nhận mật khẩu thô). Email trùng làm DB ném lỗi 23505, service đổi thành 409.
  async createUser(
    email: string,
    passwordHash: string,
    displayName: string = email.split("@")[0] ?? email,
  ): Promise<PublicUser> {
    const result = await this.db.query<PublicUserRow>(
      `INSERT INTO users (id, email, password_hash, display_name, loyalty_points)
       VALUES ($1, $2, $3, $4, 0)
       RETURNING ${PUBLIC_COLUMNS}`,
      [randomUUID(), email, passwordHash, displayName],
    );
    const row = result.rows[0];
    if (!row) throw new Error("INSERT users không trả về dòng nào");
    return toPublicUser(row);
  }
  // Tạo token đặt lại mật khẩu. Trả false (không tạo) nếu tài khoản vừa yêu cầu trong 60 giây
  // hoặc đã yêu cầu từ 5 lần trong 1 giờ. Khi tạo, các liên kết cũ chưa dùng của tài khoản bị vô hiệu hóa.
  // Giới hạn tính ngay trong DB nên đúng cả khi chạy nhiều bản backend.
  async createPasswordResetToken(
    userId: string,
    tokenHash: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    const result = await this.db.query<{ created: number }>(
      `WITH recent AS (
         SELECT count(*) FILTER (WHERE created_at > now() - interval '60 seconds') AS in_cooldown,
                count(*) AS in_window
         FROM password_reset_tokens
         WHERE user_id = $1 AND created_at > now() - interval '1 hour'
       ),
       burn AS (
         UPDATE password_reset_tokens SET used_at = now()
         WHERE user_id = $1 AND used_at IS NULL AND expires_at > now()
           AND (SELECT in_cooldown = 0 AND in_window < 5 FROM recent)
       ),
       purge AS (
         DELETE FROM password_reset_tokens WHERE expires_at < now() - interval '7 days'
       ),
       ins AS (
         INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at)
         SELECT $2, $1, $3, now() + make_interval(secs => $4::double precision)
         WHERE (SELECT in_cooldown = 0 AND in_window < 5 FROM recent)
         RETURNING id
       )
       SELECT count(*)::int AS created FROM ins`,
      [userId, randomUUID(), tokenHash, ttlSeconds],
    );
    return Number(result.rows[0]?.created ?? 0) > 0;
  }
  // Đặt mật khẩu mới bằng token, trong MỘT câu lệnh: chỉ token còn hạn và chưa dùng mới đổi được mật khẩu,
  // token bị đánh dấu đã dùng, và mọi token khác của tài khoản bị vô hiệu hóa. Hai request cùng token chỉ một cái thành công.
  async resetPasswordWithToken(
    tokenHash: string,
    passwordHash: string,
  ): Promise<boolean> {
    const result = await this.db.query<{ id: string }>(
      `WITH used AS (
         UPDATE password_reset_tokens SET used_at = now()
         WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
         RETURNING id, user_id
       ),
       changed AS (
         UPDATE users SET password_hash = $2
         WHERE id IN (SELECT user_id FROM used)
         RETURNING id
       ),
       burn AS (
         UPDATE password_reset_tokens SET used_at = now()
         WHERE user_id IN (SELECT id FROM changed) AND used_at IS NULL
           AND id NOT IN (SELECT id FROM used)
       )
       SELECT id FROM changed`,
      [tokenHash, passwordHash],
    );
    return result.rows.length > 0;
  }
  async findById(userId: string): Promise<PublicUser | null> {
    const result = await this.db.query<PublicUserRow>(
      `SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = $1`,
      [userId],
    );
    const row = result.rows[0];
    return row ? toPublicUser(row) : null;
  }
}
