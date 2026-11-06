import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { DatabaseService } from "../config/db.js";
import type { SepayWebhookPayload, SepayWebhookResult } from "./sepay.types.js";
import { SepayModel } from "./sepay.model.js";

@Injectable()
export class SepayService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(SepayModel) private readonly model: SepayModel,
  ) {}

  async receiveWebhook(
    payload: unknown,
    authorizationHeader: string | undefined,
  ): Promise<SepayWebhookResult> {
    this.assertAuthorization(authorizationHeader);
    const webhook = this.parsePayload(payload);
    const orderId = this.extractOrderId(webhook.content);
    const providerTransactionId = String(webhook.id);
    const providerReference = webhook.referenceCode ?? null;
    const payloadHash = createHash("sha256")
      .update(JSON.stringify(webhook))
      .digest("hex");

    return this.db.withTransaction(async (transaction) => {
      const existing = await this.model.findProviderTransaction(
        providerTransactionId,
        transaction,
      );
      if (existing) {
        return {
          accepted: true,
          duplicate: true,
          paymentId: existing.paymentId,
          orderId: existing.orderId,
          status: "PAID",
        };
      }

      const order = await this.model.findOrderForUpdate(orderId, transaction);
      if (!order) {
        throw new BadRequestException("Không tìm thấy đơn tương ứng");
      }
      if (order.status !== "PENDING") {
        throw new ConflictException(
          `Đơn không ở trạng thái PENDING: ${order.status}`,
        );
      }
      if (!order.isUnexpired) {
        throw new ConflictException("Mã QR của đơn đã hết hạn");
      }
      if (webhook.transferAmount !== order.total) {
        throw new BadRequestException("Số tiền SePay không khớp tổng đơn");
      }

      const paymentId = randomUUID();
      await this.model.insertProcessingPayment(
        order.id,
        paymentId,
        `sepay:${providerTransactionId}`,
        payloadHash,
        webhook.transferAmount,
        providerTransactionId,
        providerReference,
        webhook,
        transaction,
      );
      await this.model.markPaymentSucceeded(paymentId, transaction);
      await this.model.markOrderPaid(order.id, transaction);
      await this.model.insertEarn(
        order.userId,
        order.id,
        Math.floor(order.total / 10000),
        transaction,
      );

      return {
        accepted: true,
        duplicate: false,
        paymentId,
        orderId: order.id,
        status: "PAID",
      };
    });
  }

  private assertAuthorization(header: string | undefined): void {
    const configured = process.env.SEPAY_WEBHOOK_API_KEY;
    if (!configured || !header) {
      throw new UnauthorizedException("Webhook SePay chưa được xác thực");
    }

    const prefix = "Apikey ";
    if (!header.startsWith(prefix)) {
      throw new UnauthorizedException("Webhook SePay không hợp lệ");
    }

    const expected = Buffer.from(configured);
    const received = Buffer.from(header.slice(prefix.length));
    if (
      expected.length !== received.length ||
      !timingSafeEqual(expected, received)
    ) {
      throw new UnauthorizedException("Webhook SePay không hợp lệ");
    }
  }

  private parsePayload(value: unknown): SepayWebhookPayload {
    if (!value || typeof value !== "object") {
      throw new BadRequestException("Payload SePay không hợp lệ");
    }
    const payload = value as Partial<SepayWebhookPayload>;
    if (
      !Number.isInteger(payload.id) ||
      typeof payload.content !== "string" ||
      payload.content.trim() === "" ||
      payload.transferType !== "in" ||
      typeof payload.transferAmount !== "number" ||
      !Number.isSafeInteger(payload.transferAmount) ||
      payload.transferAmount < 0
    ) {
      throw new BadRequestException("Payload SePay thiếu dữ liệu giao dịch");
    }
    return payload as SepayWebhookPayload;
  }

  private extractOrderId(content: string): string {
    const paymentCode = content.match(/\bDH[0-9]{8}\b/i)?.[0].toUpperCase();
    const match = content.match(
      /\bBREWLITE[-_\s]?ORDER[-_\s]?([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\b/i,
    );
    const legacyQrMatch = content
      .trim()
      .match(
        /^([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i,
      );
    const orderId = paymentCode ?? match?.[1] ?? legacyQrMatch?.[1];
    if (!orderId) {
      throw new BadRequestException(
        "Nội dung chuyển khoản không có mã đơn hàng hợp lệ",
      );
    }
    return orderId;
  }
}
