// TV1 — Model Promotion: chỉ truy vấn dữ liệu, không chứa luật áp dụng mã.
import { Inject, Injectable } from "@nestjs/common";
import { DatabaseService } from "../config/db.js";
import type { Promotion } from "../types/promotion.js";

@Injectable()
export class PromotionModel {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async findByCode(code: string): Promise<Promotion | null> {
    const result = await this.db.query<Promotion>(
      `SELECT id, code, type, value, minimum_amount,
              active, starts_at, ends_at
       FROM promotions
       WHERE code = $1`,
      [code.trim().toUpperCase()],
    );
    return result.rows[0] ?? null;
  }
}
