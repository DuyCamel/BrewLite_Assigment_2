import { CUSTOMER_ROUTES } from "../../routes/customer.routes.js";
import {
  BadRequestException,
  Body,
  Controller,
  Inject,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import {
  JwtAuthGuard,
  type AuthenticatedRequest,
} from "../../guards/jwt-auth.guard.js";
import { OrdersService } from "../../services/orders.service.js";
import type { CreateOrderInput } from "../../types/contracts.js";

function parseCreateOrderInput(body: unknown): CreateOrderInput {
  if (typeof body !== "object" || body === null) {
    throw new BadRequestException("Dữ liệu đơn hàng không hợp lệ");
  }

  const value = body as Record<string, unknown>;
  if (!Array.isArray(value.items) || value.items.length === 0) {
    throw new BadRequestException("Đơn hàng phải có ít nhất một món");
  }

  const items = value.items.map((item) => {
    if (typeof item !== "object" || item === null) {
      throw new BadRequestException("Món trong đơn hàng không hợp lệ");
    }
    const line = item as Record<string, unknown>;
    if (
      typeof line.productId !== "string" ||
      typeof line.size !== "string" ||
      !Array.isArray(line.toppingIds) ||
      !line.toppingIds.every((id) => typeof id === "string") ||
      typeof line.quantity !== "number" ||
      !Number.isInteger(line.quantity)
    ) {
      throw new BadRequestException(
        "Thông tin món trong đơn hàng không hợp lệ",
      );
    }
    return {
      productId: line.productId,
      size: line.size,
      toppingIds: line.toppingIds,
      quantity: line.quantity,
    };
  });

  if (
    value.promotionCode !== undefined &&
    typeof value.promotionCode !== "string"
  ) {
    throw new BadRequestException("Mã giảm giá không hợp lệ");
  }

  return {
    items,
    ...(value.promotionCode === undefined
      ? {}
      : { promotionCode: value.promotionCode }),
  };
}

function currentUserId(request: AuthenticatedRequest): string {
  const id = request.user?.id;
  if (!id) throw new UnauthorizedException();
  return id;
}

@UseGuards(JwtAuthGuard)
@Controller(CUSTOMER_ROUTES.orders.base)
export class OrdersController {
  constructor(
    @Inject(OrdersService) private readonly orders: OrdersService,
  ) {}

  @Post(CUSTOMER_ROUTES.orders.create)
  createOrder(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.orders.createOrder(
      currentUserId(request),
      parseCreateOrderInput(body),
    );
  }

  @Post(CUSTOMER_ROUTES.orders.validatePromotion)
  validatePromotion(@Body() body: unknown) {
    if (
      typeof body !== "object" ||
      body === null ||
      typeof (body as Record<string, unknown>).code !== "string" ||
      typeof (body as Record<string, unknown>).subtotal !== "number"
    ) {
      throw new BadRequestException("Thông tin mã khuyến mãi không hợp lệ");
    }
    const value = body as { code: string; subtotal: number };
    return this.orders.validatePromotion(value.code, value.subtotal);
  }

  @Post(CUSTOMER_ROUTES.orders.cancel)
  cancelOrder(
    @Req() request: AuthenticatedRequest,
    @Param("id") orderId?: string,
  ) {
    if (typeof orderId !== "string" || orderId.trim() === "") {
      throw new BadRequestException("Mã đơn không hợp lệ");
    }
    return this.orders.cancelOrder(currentUserId(request), orderId.trim());
  }

  @Post(CUSTOMER_ROUTES.orders.retryPayment)
  retryPayment(
    @Req() request: AuthenticatedRequest,
    @Param("id") orderId?: string,
  ) {
    if (typeof orderId !== "string" || orderId.trim() === "") {
      throw new BadRequestException("Mã đơn không hợp lệ");
    }
    return this.orders.preparePaymentRetry(
      currentUserId(request),
      orderId.trim(),
    );
  }
}
