// loyalty.model.ts
import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { PoolClient } from "../types/contracts.js";

@Injectable()
export class LoyaltyModel {
  // Trigger loyalty_balance tự cập nhật users.loyalty_points; luôn ghi EARN kể cả 0 điểm để khớp trạng thái PAID.
  async insertEarnOnce(
    userId: string,
    orderId: string,
    points: number,
    transaction: PoolClient,
  ): Promise<void> {
    await transaction.query(
      `INSERT INTO loyalty_transactions (id, user_id, order_id, type, points)
       VALUES ($1, $2, $3, 'EARN', $4)
       ON CONFLICT (order_id, type) DO NOTHING`,
      [randomUUID(), userId, orderId, points],
    );
  }
}
