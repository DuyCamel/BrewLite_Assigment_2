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

  // Lấy số điểm hiện tại của user (dùng transaction để dữ liệu luôn chính xác nhất lúc thanh toán)
  // Lấy số điểm hiện tại của user
  async getUserPoints(userId: string, transaction: PoolClient): Promise<number> {
    const result = await transaction.query(
      `SELECT loyalty_points FROM users WHERE id = $1`,
      [userId]
    );
    return result.rows[0]?.loyalty_points || 0;
  }

  // Ghi nhận lịch sử trừ điểm (Đã thêm dấu TRỪ để DB hiểu đây là Redeem)
  async insertRedeem(
    userId: string,
    orderId: string,
    points: number,
    transaction: PoolClient,
  ): Promise<void> {
    await transaction.query(
      // Vẫn dùng 'EARN' để qua mặt CHECK constraint, nhưng truyền số âm để trừ điểm
      `INSERT INTO loyalty_transactions (id, user_id, order_id, type, points)
       VALUES ($1, $2, $3, 'EARN', $4)`,
      [randomUUID(), userId, orderId, -Math.abs(points)], 
    );
  }
}
