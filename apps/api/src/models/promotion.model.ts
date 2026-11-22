// TV1 — Model Promotion: chỉ truy vấn dữ liệu, không chứa luật áp dụng mã.
import { Inject, Injectable } from "@nestjs/common";
import { DatabaseService } from "../config/db.js";
import type { PoolClient } from "pg";
import type { Promotion } from "../types/promotion.js";

@Injectable()
export class PromotionModel {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async findByCode(code: string, client?: PoolClient): Promise<Promotion | null> {
    const sql = `SELECT id, code, type, value, minimum_amount,
                        active, starts_at, ends_at
                 FROM promotions
                 WHERE code = $1`;
    const parameters = [code.trim().toUpperCase()];
    const result = client
      ? await client.query<Promotion>(sql, parameters)
      : await this.db.query<Promotion>(sql, parameters);
    return result.rows[0] ?? null;
  }
}
