// TV4 — Inventory service: logic giữ và hoàn tồn kho. SQL nằm ở InventoryModel.
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InventoryModel } from "../models/inventory.model.js";
import type { PoolClient, StockItem } from "../types/contracts.js";
import type { OrderLine } from "../types/contracts.js";

@Injectable()
export class InventoryService {
  constructor(
    @Inject(InventoryModel) private readonly inventoryModel: InventoryModel,
  ) {}

  // Gộp số lượng theo productId rồi trừ kho; thiếu hàng/tranh tồn thì ném lỗi để transaction rollback.
  // LƯU Ý TV4: nhánh nguyên liệu (InventoryModel.reserveIngredients, do người khác thêm) chỉ trừ cho món có công thức.
  // Đặt riêng món chưa có công thức (4 món matcha theo tài liệu: matcha-dau, matcha-dua, matcha-kem, matcha-yen-mach)
  // thì bị 409, nhưng đặt CHUNG với món khác thì món thiếu công thức không bị trừ gì. Chờ nhóm chốt cách xử lý
  // (test todo trong test/ingredient-flow.test.ts mô tả hành vi mong muốn).
  async reserveStock(
    items: Array<StockItem | OrderLine>,
    transaction: PoolClient,
    orderId?: string,
  ): Promise<void> {
    if (
      orderId &&
      items.every((item) => "size" in item && "toppingIds" in item)
    ) {
      const reserved = await this.inventoryModel.reserveIngredients(
        items as OrderLine[],
        orderId,
        transaction,
      );
      if (reserved) return;
    }
    const totals = new Map<string, number>();
    for (const item of items) {
      const current = totals.get(item.productId) ?? 0;
      totals.set(item.productId, current + item.quantity);
    }

    for (const [productId, quantity] of totals) {
      const snapshot = await this.inventoryModel.findStock(
        productId,
        transaction,
      );
      if (snapshot === null) {
        throw new NotFoundException(`Không tìm thấy sản phẩm ${productId}`);
      }
      if (snapshot.stock < quantity) {
        throw new ConflictException(`Sản phẩm ${productId} không đủ hàng`);
      }

      const ok = await this.inventoryModel.decreaseStock(
        productId,
        quantity,
        snapshot.version,
        transaction,
      );
      if (!ok) {
        throw new ConflictException(
          `Sản phẩm ${productId} vừa bị người khác đặt`,
        );
      }
    }
  }

  // true = vừa hoàn tồn, false = đã hoàn trước đó (không phải lỗi).
  async releaseStock(
    orderId: string,
    transaction: PoolClient,
  ): Promise<boolean> {
    return this.inventoryModel.restoreStockOnce(orderId, transaction);
  }
}