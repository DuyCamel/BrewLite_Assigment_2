// TV4 — Orders service: tạo, hủy, hết hạn giữ tồn, chuẩn bị thanh toán lại.
// Điều phối transaction qua DatabaseService.withTransaction; SQL nằm ở OrderModel/InventoryModel.
import { randomUUID } from "crypto";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  NotImplementedException,
} from "@nestjs/common";
import { DatabaseService } from "../config/db.js";
import { OrderModel } from "../models/order.model.js";
import { InventoryService } from "./inventory.service.js";
import { PromotionsService } from "./promotions.service.js";
import { calculateUnitPrice } from "./order-pricing.js";
import type { CreateOrderInput } from "../types/contracts.js";
import type { NewOrderItem } from "../types/order.types.js";

@Injectable()
export class OrdersService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(OrderModel) private readonly orderModel: OrderModel,
    @Inject(InventoryService) private readonly inventoryService: InventoryService,
    @Inject(PromotionsService)
    private readonly promotionsService: PromotionsService,
  ) {}

  async validatePromotion(code: string, subtotal: number) {
    const promotion = await this.promotionsService.validatePromotion(
      code,
      subtotal,
    );
    const discount = await this.promotionsService.calculateDiscount(
      code,
      subtotal,
    );
    return { code: promotion.code, discount, total: subtotal - discount };
  }

  // TODO TV4: previewOrder (xem giá tạm, không ghi DB). Chưa có route riêng; thống nhất request/response với TV1 và TV2 trước.
  previewOrder(userId: string, input: CreateOrderInput): never {
    throw new NotImplementedException("TV4: previewOrder chưa triển khai");
  }

  // Tạo đơn PENDING + chi tiết + giữ tồn trong một transaction.
  async createOrder(userId: string, input: CreateOrderInput) {
    if (!input.items || input.items.length === 0) {
      throw new BadRequestException("Đơn hàng phải có ít nhất một món");
    }
    for (const line of input.items) {
      if (
        !Number.isInteger(line.quantity) ||
        line.quantity < 1 ||
        line.quantity > 99
      ) {
        throw new BadRequestException(
          `Số lượng của sản phẩm ${line.productId} phải là số nguyên từ 1 đến 99`,
        );
      }
    }
    return this.db.withTransaction(async (client) => {
      // Bước 1: đọc giá từ DB, không tin giá client
      const productIds = [...new Set(input.items.map((i) => i.productId))];
      const products = await this.orderModel.findForPricing(productIds, client);

      // Bước 2: tính từng dòng chi tiết
      const orderId = randomUUID();
      const orderItems: NewOrderItem[] = input.items.map((line) => {
        const product = products.find((p) => p.id === line.productId);
        if (!product) {
          throw new BadRequestException(
            `Sản phẩm ${line.productId} không tồn tại`,
          );
        }
        const unitPrice = calculateUnitPrice(
          product,
          line.size,
          line.toppingIds,
        );
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

      // Bước 3: tổng tiền
      const subtotal = orderItems.reduce(
        (sum, item) => sum + item.lineTotal,
        0,
      );
      const promotion = input.promotionCode
        ? await this.promotionsService.validatePromotion(
            input.promotionCode,
            subtotal,
          )
        : null;
      const discount = promotion
        ? Math.min(
            promotion.type === "PERCENT"
              ? Math.floor((subtotal * promotion.value) / 100)
              : promotion.value,
            subtotal,
          )
        : 0;
      const total = subtotal - discount;

      // Tạo row đơn trước để reservation nguyên liệu tham chiếu được qua khóa ngoại.
      const order = await this.orderModel.insertOrder(
        {
          id: orderId,
          userId,
          subtotal,
          discount,
          total,
          promotionId: promotion?.id ?? null,
        },
        client,
      );

      // Giữ tồn cùng transaction; thiếu hàng sẽ rollback cả đơn vừa tạo.
      await this.inventoryService.reserveStock(input.items, client, orderId);

      // Ghi chi tiết sau khi giữ tồn; tất cả vẫn nằm trong cùng transaction.
      await this.orderModel.insertOrderItems(order.id, orderItems, client);

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
        throw new ConflictException(
          "Đơn đang có thanh toán xử lý, chưa thể hủy",
        );
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

  // Job hủy đơn PENDING quá hạn; mỗi đơn một transaction. Chưa có lịch gọi hàm này.
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

  // PAYMENT_FAILED -> PENDING: giữ tồn mới trước, hết hàng thì rollback và đơn vẫn PAYMENT_FAILED.
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
