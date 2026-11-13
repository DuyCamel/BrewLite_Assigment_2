// TV4 — Inventory service: logic giữ và hoàn tồn kho nguyên liệu. SQL nằm ở InventoryModel.
import { Inject, Injectable } from "@nestjs/common";
import { InventoryModel } from "../models/inventory.model.js";
import type { PoolClient } from "../types/contracts.js";
import type { OrderLine } from "../types/contracts.js";

@Injectable()
export class InventoryService {
  constructor(
    @Inject(InventoryModel) private readonly inventoryModel: InventoryModel,
  ) {}

  // Thiếu nguyên liệu hoặc công thức sẽ ném lỗi để transaction rollback.
  async reserveStock(
    items: OrderLine[],
    transaction: PoolClient,
    orderId: string,
  ): Promise<void> {
    await this.inventoryModel.reserveIngredients(items, orderId, transaction);
  }

  // true = vừa hoàn tồn, false = đã hoàn trước đó (không phải lỗi).
  async releaseStock(
    orderId: string,
    transaction: PoolClient,
  ): Promise<boolean> {
    return this.inventoryModel.restoreStockOnce(orderId, transaction);
  }
}