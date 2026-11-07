// TV4 — Orders service: tạo, hủy, hết hạn giữ tồn, chuẩn bị thanh toán lại, xem giá tạm.
// Điều phối transaction qua DatabaseService.withTransaction; SQL nằm ở OrderModel/InventoryModel.
//
// LƯU Ý TV4 (trạng thái 31/10/2026, đọc trước khi dùng):
// - createOrder, cancelOrder: xong, đã có OrdersController và test.
// - previewOrder: service xong nhưng CHƯA có route/controller. Request/response là ĐỀ XUẤT, chờ TV2 và TV1 chốt.
// - expirePendingOrders: do OrderExpiryJob gọi; job CHƯA đăng ký trong providers của app.module.ts nên chưa chạy.
// - preparePaymentRetry: CHƯA có route, chờ TV5 gọi. Khi thanh toán thất bại, TV5 phải đổi PAYMENT_FAILED và
//   gọi InventoryService.releaseStock trong CÙNG một transaction (trigger 002 đòi stock_released = true).
import { randomUUID } from "crypto";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import type { PoolClient } from "pg";
import { DatabaseService } from "../config/db.js";
import { OrderModel } from "../models/order.model.js";
import { InventoryService } from "./inventory.service.js";
import { calculateUnitPrice } from "./order-pricing.js";
import type { CreateOrderInput } from "../types/contracts.js";
import type { NewOrderItem } from "../types/order.types.js";
import { PromotionsService } from "./promotions.service.js";

@Injectable()
export class OrdersService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(OrderModel) private readonly orderModel: OrderModel,
    @Inject(InventoryService)
    private readonly inventoryService: InventoryService,
    @Inject(PromotionsService)
    private readonly promotionsService: PromotionsService,
  ) {}

  async validatePromotion(code: string, subtotal: number) {
    const promotion = await this.promotionsService.validatePromotion(code, subtotal);
    const discount = await this.promotionsService.calculateDiscount(code, subtotal);
    return { code: promotion.code, discount, total: subtotal - discount };
  }

  // Xem giá tạm: tính giống hệt createOrder nhưng không ghi DB và không giữ tồn (hết hàng vẫn xem được giá).
  // ĐỀ XUẤT request/response, chờ TV2 và TV1 chốt: request dùng CreateOrderInput, response gồm các dòng đã tính giá.
  async previewOrder(input: CreateOrderInput) {
    this.assertValidOrderInput(input);
    return this.db.withTransaction(async (client) => {
      const priced = await this.priceOrder(input, client);
      return {
        items: priced.items.map((item) => ({
          productId: item.productId,
          productName: item.productName,
          size: item.size,
          toppingIds: item.toppingIds,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          lineTotal: item.lineTotal,
        })),
        subtotal: priced.subtotal,
        discount: priced.discount,
        total: priced.total,
      };
    });
  }

  // Tạo đơn PENDING + chi tiết + giữ tồn trong một transaction; áp mã khuyến mãi (TV1) nếu có.
  async createOrder(userId: string, input: CreateOrderInput) {
    this.assertValidOrderInput(input);
    return this.db.withTransaction(async (client) => {
      // Bước 1: tính giá từ DB (dùng chung với previewOrder)
      const priced = await this.priceOrder(input, client);

      // Bước 2: tạo row đơn trước để reservation nguyên liệu tham chiếu được qua khóa ngoại
      const orderId = randomUUID();
      const order = await this.orderModel.insertOrder(
        {
          id: orderId,
          userId,
          subtotal: priced.subtotal,
          discount: priced.discount,
          total: priced.total,
          promotionId: priced.promotionId,
        },
        client,
      );

      // Bước 3: giữ tồn (kể cả nguyên liệu, tham chiếu khóa ngoại tới đơn vừa tạo); hết hàng thì rollback cả đơn
      await this.inventoryService.reserveStock(input.items, client, orderId);

      // Bước 4: ghi chi tiết sau khi giữ tồn, vẫn cùng transaction
      await this.orderModel.insertOrderItems(order.id, priced.items, client);

      return {
        orderId: order.id,
        paymentCode: order.paymentCode,
        status: order.status,
        subtotal: order.subtotal,
        discount: order.discount,
        total: order.total,
      };
    });
  }

  // Kiểm tra đầu vào dùng chung cho createOrder và previewOrder (ném 400).
  private assertValidOrderInput(input: CreateOrderInput): void {
    if (!input || !Array.isArray(input.items) || input.items.length === 0) {
      throw new BadRequestException("Đơn hàng phải có ít nhất một món");
    }

    if (input.promotionCode !== undefined && input.promotionCode !== null && typeof input.promotionCode !== "string") {
      throw new BadRequestException("Mã giảm giá phải là chuỗi");
    }

    for (const line of input.items) {
      if (typeof line !== "object" || line === null) {
        throw new BadRequestException("Mỗi món trong đơn phải là một đối tượng");
      }
      if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 99) {
        throw new BadRequestException(
          `Số lượng của sản phẩm ${line.productId} phải là số nguyên từ 1 đến 99`,
        );
      }
    }
  }

  // Tính giá từ DB (không tin giá client): từng dòng, tổng tiền, khuyến mãi. Không ghi gì xuống DB.
  private async priceOrder(input: CreateOrderInput, client: PoolClient) {
    const productIds = [...new Set(input.items.map((i) => i.productId))];
    const products = await this.orderModel.findForPricing(productIds, client);

    const items: NewOrderItem[] = input.items.map((line) => {
      const product = products.find((p) => p.id === line.productId);
      if (!product) {
        throw new BadRequestException(`Sản phẩm ${line.productId} không tồn tại`);
      }
      const unitPrice = calculateUnitPrice(product, line.size, line.toppingIds);
      return {
        id: randomUUID(),
        productId: line.productId,
        productName: product.name,
        size: line.size,
        toppingIds: line.toppingIds,
        quantity: line.quantity,
        unitPrice,
        lineTotal: unitPrice * line.quantity,
      };
    });

    const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
    let discount = 0;
    let promotionId: string | null = null;
    const promotionCode = input.promotionCode?.trim();
    if (promotionCode) {
      const promotion = await this.promotionsService.validatePromotion(promotionCode, subtotal);
      discount = await this.promotionsService.calculateDiscount(promotionCode, subtotal);
      promotionId = promotion.id;
    }
    if (!Number.isInteger(discount) || discount < 0 || discount > subtotal) {
      throw new InternalServerErrorException("Số tiền giảm giá không hợp lệ");
    }

    return { items, subtotal, discount, promotionId, total: subtotal - discount };
  }

  // Hủy đơn của chính người dùng; hoàn tồn cùng transaction (trigger 002 đòi CANCELLED phải có stock_released = true).
  async cancelOrder(userId: string, orderId: string) {
    return this.db.withTransaction(async (client) => {
      const order = await this.orderModel.findForUpdate(orderId, client);

      if (order === null || order.userId !== userId) {
        throw new NotFoundException("Không tìm thấy đơn hàng");
      }
      if (order.status !== "PENDING" && order.status !== "PAYMENT_FAILED") {
        throw new ConflictException(
          `Không thể hủy đơn đang ở trạng thái ${order.status}`,
        );
      }
      if (await this.orderModel.hasProcessingPayment(orderId, client)) {
        throw new ConflictException("Đơn đang có thanh toán xử lý, chưa thể hủy");
      }

      const changed = await this.orderModel.updateStatus(
        orderId,
        order.status,
        "CANCELLED",
        client,
      );
      if (!changed) {
        throw new ConflictException("Trạng thái đơn vừa thay đổi, hãy tải lại");
      }

      await this.inventoryService.releaseStock(orderId, client);

      return { orderId, status: "CANCELLED" as const };
    });
  }

  // Job hủy đơn quá hạn hoặc QR thứ hai quá hạn; mỗi đơn một transaction.
  async expirePendingOrders(): Promise<number> {
    const expiredIds = await this.db.withTransaction((client) =>
      this.orderModel.findExpiredPendingOrders(client),
    );

    let cancelled = 0;
    for (const orderId of expiredIds) {
      try {
        await this.db.withTransaction(async (client) => {
          const order = await this.orderModel.findForUpdate(orderId, client);
          if (order === null || order.status !== "PENDING") {
            return;
          }
          if (
            new Date(order.expiresAt).getTime() > Date.now() &&
            (order.qrAttempts < 2 ||
              new Date(order.qrExpiresAt).getTime() > Date.now())
          ) {
            return;
          }
          if (await this.orderModel.hasProcessingPayment(orderId, client)) {
            return;
          }
          const changed = await this.orderModel.updateStatus(
            orderId,
            "PENDING",
            "CANCELLED",
            client,
          );
          if (!changed) {
            return;
          }
          await this.inventoryService.releaseStock(orderId, client);
          cancelled++;
        });
      } catch (error) {
        console.error(`Hết hạn đơn ${orderId} thất bại`, error);
      }
    }
    return cancelled;
  }

  async reissueQr(userId: string, orderId: string) {
    return this.db.withTransaction(async (client) => {
      const order = await this.orderModel.findForUpdate(orderId, client);
      if (!order || order.userId !== userId) {
        throw new NotFoundException("Không tìm thấy đơn hàng");
      }
      if (
        order.status !== "PENDING" ||
        order.qrAttempts !== 1 ||
        new Date(order.qrExpiresAt).getTime() > Date.now() ||
        new Date(order.expiresAt).getTime() <= Date.now() ||
        (await this.orderModel.hasProcessingPayment(orderId, client))
      ) {
        throw new ConflictException("Không thể cấp lại QR cho đơn này");
      }
      const renewed = await this.orderModel.reissueQr(orderId, client);
      if (!renewed)
        throw new ConflictException("Đơn vừa thay đổi, hãy tải lại");
      return renewed;
    });
  }

  // PAYMENT_FAILED -> PENDING: giữ tồn mới trước, hết hàng thì rollback và đơn vẫn PAYMENT_FAILED.
  // LƯU Ý TV4: phải truyền orderId vào reserveStock để giữ lại NGUYÊN LIỆU (xem test/ingredient-flow.test.ts).
  async preparePaymentRetry(userId: string, orderId: string) {
    return this.db.withTransaction(async (client) => {
      const order = await this.orderModel.findForUpdate(orderId, client);

      if (order === null || order.userId !== userId) {
        throw new NotFoundException("Không tìm thấy đơn hàng");
      }
      if (order.status !== "PAYMENT_FAILED") {
        throw new ConflictException(
          `Chỉ thử lại được đơn PAYMENT_FAILED, hiện là ${order.status}`,
        );
      }

      const items = await this.orderModel.findItemsForStock(orderId, client);
      await this.inventoryService.reserveStock(items, client, orderId);

      const reopened = await this.orderModel.reopenForRetry(orderId, client);
      if (!reopened) {
        throw new ConflictException("Trạng thái đơn vừa thay đổi, hãy tải lại");
      }

      return { orderId, status: "PENDING" as const };
    });
  }
}
