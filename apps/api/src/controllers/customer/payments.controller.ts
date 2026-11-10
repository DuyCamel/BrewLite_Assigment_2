import { CUSTOMER_ROUTES } from "../../routes/customer.routes.js";
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard, type AuthenticatedRequest } from "../../guards/jwt-auth.guard.js";
import { PaymentsService } from "../../services/payments.service.js";
import type { PaymentInput } from "../../types/contracts.js";

function parsePaymentInput(body: unknown): PaymentInput {
  // Máy định vị 1: In ra màn hình Terminal xem Frontend gửi lên cái gì
  console.log("=== DỮ LIỆU FRONTEND GỬI LÊN ===", body);
  
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new BadRequestException("Thông tin thanh toán không hợp lệ (Lỗi 1: Body rỗng hoặc sai kiểu)");
  }
  
  const value = body as Record<string, unknown>;
  
  if (typeof value.orderId !== "string" || value.orderId.trim() === "") {
    console.log("Lỗi orderId:", value.orderId);
    throw new BadRequestException("Thông tin thanh toán không hợp lệ (Lỗi 2: Thiếu orderId)");
  }
  
  // Nới lỏng chốt chặn: Cho phép SEPAY
  if (value.method !== "WALLET" && value.method !== "CARD" && value.method !== "SEPAY") {
    console.log("Lỗi method:", value.method);
    throw new BadRequestException("Thông tin thanh toán không hợp lệ (Lỗi 3: Sai phương thức " + value.method + ")");
  }
  
  return { 
    orderId: value.orderId.trim(), 
    method: value.method as any,
    pointsToUse: typeof value.pointsToUse === 'number' ? value.pointsToUse : 0
  };
}

function currentUserId(request: AuthenticatedRequest): string {
  const id = request.user?.id;
  if (!id) throw new UnauthorizedException();
  return id;
}

@UseGuards(JwtAuthGuard)
@Controller(CUSTOMER_ROUTES.payments.base)
export class PaymentsController {
  constructor(
    @Inject(PaymentsService) private readonly payments: PaymentsService,
  ) {}

  @Post(CUSTOMER_ROUTES.payments.create)
  createPayment(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey?: string
  ) {
    if (typeof idempotencyKey !== "string" || idempotencyKey.trim() === "") {
      throw new BadRequestException("Thiếu Idempotency-Key ở Header");
    }
    return this.payments.createPayment(
      currentUserId(request),
      parsePaymentInput(body),
      idempotencyKey.trim(),
    );
  }

  @Get(CUSTOMER_ROUTES.payments.status)
  getPaymentStatus(
    @Req() request: AuthenticatedRequest,
    @Param("id") paymentId: string,
  ) {
    return this.payments.getPaymentStatus(currentUserId(request), paymentId);
  }

  @Post(CUSTOMER_ROUTES.payments.reconcile)
  reconcilePayment(
    @Req() request: AuthenticatedRequest,
    @Param("id") paymentId: string,
  ) {
    return this.payments.reconcilePayment(currentUserId(request), paymentId);
  }
}