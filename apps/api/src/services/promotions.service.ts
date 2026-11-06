// TV1 — Luật áp dụng và tính tiền khuyến mãi.
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { PromotionModel } from "../models/promotion.model.js";
import type { Promotion } from "../types/promotion.js";

@Injectable()
export class PromotionsService {
  constructor(
    @Inject(PromotionModel) private readonly promotionModel: PromotionModel,
  ) {}

  async validatePromotion(code: string, subtotal: number): Promise<Promotion> {
    const normalizedCode = code.trim().toUpperCase();
    if (!normalizedCode) {
      throw new BadRequestException("Mã giảm giá không được để trống");
    }
    if (!Number.isInteger(subtotal) || subtotal < 0) {
      throw new BadRequestException("Subtotal không hợp lệ");
    }

    const promotion = await this.promotionModel.findByCode(normalizedCode);
    if (!promotion) {
      throw new BadRequestException("Mã giảm giá không tồn tại");
    }

    const now = new Date();
    if (
      !promotion.active ||
      now < new Date(promotion.starts_at) ||
      now > new Date(promotion.ends_at)
    ) {
      throw new BadRequestException("Mã giảm giá không còn hiệu lực");
    }

    if (promotion.minimum_amount > subtotal) {
      throw new BadRequestException(
        `Đơn tối thiểu ${promotion.minimum_amount} đồng để dùng mã này`,
      );
    }

    return promotion;
  }

  async calculateDiscount(code: string, subtotal: number): Promise<number> {
    const promotion = await this.validatePromotion(code, subtotal);
    let discount = 0;
    if (promotion.type === "PERCENT") {
      discount = Math.floor((subtotal * promotion.value) / 100);
    } else if (promotion.type === "FIXED") {
      discount = promotion.value;
    }

    return Math.min(discount, subtotal);
  }
}
