import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { DatabaseService } from "../config/db.js";
import { PaymentModel, type PaymentAttemptRecord } from "../models/payment.model.js";
import { OrderModel } from "../models/order.model.js";
import { MockPaymentGateway } from "../gateways/mock-payment.gateway.js";
import { InventoryService } from "./inventory.service.js";
import { LoyaltyService } from "./loyalty.service.js";
import type { PaymentInput, PaymentResult } from "../types/contracts.js";

type GatewayResult = "SUCCESS" | "FAILED" | "TIMEOUT";
const MAX_IDEMPOTENCY_KEY_LENGTH = 200;

@Injectable()
export class PaymentsService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(PaymentModel) private readonly paymentModel: PaymentModel,
    @Inject(OrderModel) private readonly orderModel: OrderModel,
    @Inject(MockPaymentGateway) private readonly mockGateway: MockPaymentGateway,
    @Inject(InventoryService) private readonly inventoryService: InventoryService,
    @Inject(LoyaltyService) private readonly loyaltyService: LoyaltyService,
  ) {}

  private hashPayload(input: PaymentInput): string {
    // Chỉ hash các thuộc tính cốt lõi tạo nên giao dịch
    return createHash("sha256")
      .update(JSON.stringify({ orderId: input.orderId, method: input.method }))
      .digest("hex");
  }

  async createPayment(
    userId: string,
    input: PaymentInput,
    idempotencyKey: string,
  ): Promise<PaymentAttemptRecord> {
    this.validateRequest(input, idempotencyKey);
    const payloadHash = this.hashPayload(input);
    const existing = await this.paymentModel.findByKey(idempotencyKey);
    if (existing) {
      return this.resumeExistingPayment(userId, existing, payloadHash);
    }

    let payment: PaymentAttemptRecord;
    try {
      payment = await this.db.withTransaction(async (client) => {
        const order = await this.orderModel.findForUpdate(input.orderId, client);
        if (!order || order.userId !== userId) {
          throw new NotFoundException(
            "Đơn hàng không tồn tại hoặc bạn không có quyền",
          );
        }

        // Khóa đơn tuần tự hóa hai request; kiểm tra lại key trong transaction để
        // request đồng thời cùng key nhận lại đúng payment đã được tạo trước đó.
        const transactionExisting = await this.paymentModel.findByKey(
          idempotencyKey,
          client,
        );
        if (transactionExisting) return transactionExisting;

        if (order.status !== "PENDING") {
          throw new ConflictException(
            `Không thể thanh toán đơn hàng đang ở trạng thái ${order.status}`,
          );
        }
        if (
          await this.orderModel.hasProcessingPayment(input.orderId, client)
        ) {
          throw new ConflictException("Đơn hàng đang có giao dịch xử lý");
        }

        const paymentId = await this.paymentModel.insertAttempt(
          input,
          order.total,
          idempotencyKey,
          payloadHash,
          client,
        );
        return {
          id: paymentId,
          order_id: order.id,
          user_id: userId,
          idempotency_key: idempotencyKey,
          payload_hash: payloadHash,
          amount: order.total,
          method: input.method,
          status: "PROCESSING",
        };
      });
    } catch (error) {
      if (!this.isUniqueViolation(error)) throw error;
      const racedPayment = await this.paymentModel.findByKey(idempotencyKey);
      if (!racedPayment) throw error;
      return this.resumeExistingPayment(userId, racedPayment, payloadHash);
    }

    if (payment.user_id !== userId) {
      throw new NotFoundException("Không tìm thấy giao dịch thanh toán");
    }
    if (payment.payload_hash !== payloadHash) {
      throw new ConflictException(
        "Idempotency-Key đã được dùng cho payload khác",
      );
    }
    return this.chargeAndFinalize(payment);
  }

  async getPaymentStatus(userId: string, paymentId: string): Promise<PaymentAttemptRecord> {
    const payment = await this.paymentModel.findById(paymentId);
    if (!payment || payment.user_id !== userId) {
      throw new NotFoundException("Không tìm thấy giao dịch thanh toán");
    }
    return payment;
  }

  async reconcilePayment(
    userId: string,
    paymentId: string,
  ): Promise<PaymentAttemptRecord> {
    const payment = await this.getPaymentStatus(userId, paymentId);
    if (payment.status !== "PROCESSING") return payment;
    const gatewayStatus = await this.mockGateway.lookupByKey(payment.idempotency_key);
    if (gatewayStatus === "SUCCESS" || gatewayStatus === "FAILED") {
      const result = gatewayStatus === "SUCCESS" ? "SUCCEEDED" : "FAILED";
      await this.finalizePayment(paymentId, result, payment.user_id, payment.order_id, payment.amount);
    }
    return (await this.paymentModel.findById(paymentId))!;
  }

  async finalizePayment(
    paymentId: string,
    result: "SUCCEEDED" | "FAILED",
    userId: string,
    orderId: string,
    amount: number,
  ): Promise<void> {
    await this.db.withTransaction(async (client) => {
      const order = await this.orderModel.findForUpdate(orderId, client);
      if (!order || order.userId !== userId) {
        throw new NotFoundException("Đơn hàng không tồn tại hoặc bạn không có quyền");
      }
      if (order.total !== amount) {
        throw new ConflictException("Số tiền thanh toán không khớp tổng đơn");
      }

      const updated = await this.paymentModel.updateResult(
        paymentId,
        result,
        client,
      );
      if (!updated) return;
      if (order.status !== "PENDING") {
        throw new ConflictException(
          `Không thể chốt thanh toán cho đơn ở trạng thái ${order.status}`,
        );
      }

      if (result === "SUCCEEDED") {
        const changed = await this.orderModel.updateStatus(
          orderId,
          "PENDING",
          "PAID",
          client,
        );
        if (!changed) {
          throw new ConflictException("Trạng thái đơn vừa thay đổi, hãy tải lại");
        }
        await this.loyaltyService.earnPoints(userId, orderId, amount, client);
      } else if (result === "FAILED") {
        const changed = await this.orderModel.updateStatus(
          orderId,
          "PENDING",
          "PAYMENT_FAILED",
          client,
        );
        if (!changed) {
          throw new ConflictException("Trạng thái đơn vừa thay đổi, hãy tải lại");
        }
        await this.inventoryService.releaseStock(orderId, client);
      }
    });
  }

  private validateRequest(
    input: PaymentInput,
    idempotencyKey: string,
  ): void {
    if (
      typeof idempotencyKey !== "string" ||
      idempotencyKey.trim() === "" ||
      idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH
    ) {
      throw new BadRequestException("Idempotency-Key không hợp lệ");
    }
    if (
      typeof input?.orderId !== "string" ||
      input.orderId.trim() === "" ||
      (input.method !== "WALLET" && input.method !== "CARD")
    ) {
      throw new BadRequestException("Thông tin thanh toán không hợp lệ");
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    );
  }

  private async resumeExistingPayment(
    userId: string,
    payment: PaymentAttemptRecord,
    payloadHash: string,
  ): Promise<PaymentAttemptRecord> {
    if (payment.user_id !== userId) {
      throw new NotFoundException("Không tìm thấy giao dịch thanh toán");
    }
    if (payment.payload_hash !== payloadHash) {
      throw new ConflictException(
        "Idempotency-Key đã được dùng cho payload khác",
      );
    }
    if (payment.status !== "PROCESSING") return payment;
    return this.chargeAndFinalize(payment);
  }

  private async chargeAndFinalize(
    payment: PaymentAttemptRecord,
  ): Promise<PaymentAttemptRecord> {
    const gatewayResult: GatewayResult = await this.mockGateway.charge(
      payment.order_id,
      payment.amount,
      payment.method,
      payment.idempotency_key,
    );
    if (gatewayResult !== "TIMEOUT") {
      const result = gatewayResult === "SUCCESS" ? "SUCCEEDED" : "FAILED";
      await this.finalizePayment(
        payment.id,
        result,
        payment.user_id,
        payment.order_id,
        payment.amount,
      );
    }
    return (await this.paymentModel.findById(payment.id)) ?? payment;
  }
}