import { Inject, Injectable } from "@nestjs/common";
import { LoyaltyModel } from "../models/loyalty.model.js";
import type { PoolClient } from "../types/contracts.js";

@Injectable()
export class LoyaltyService {
  constructor(@Inject(LoyaltyModel) private readonly loyaltyModel: LoyaltyModel) {}

  // Chỉ gọi trong transaction chốt PAID; unique EARN theo orderId, trigger DB tự cộng tổng điểm
  async earnPoints(
    userId: string,
    orderId: string,
    amount: number,
    transaction: PoolClient,
  ): Promise<void> {
    // Tỷ lệ quy đổi: 10.000 VNĐ = 1 điểm
    const points = Math.floor(amount / 10000);

    await this.loyaltyModel.insertEarnOnce(userId, orderId, points, transaction);
  }

  // Kiểm tra điểm
  async checkPoints(userId: string, transaction: PoolClient): Promise<number> {
    return this.loyaltyModel.getUserPoints(userId, transaction);
  }

  // Trừ điểm
  async redeemPoints(
    userId: string,
    orderId: string,
    points: number,
    transaction: PoolClient,
  ): Promise<void> {
    await this.loyaltyModel.insertRedeem(userId, orderId, points, transaction);
  }
}