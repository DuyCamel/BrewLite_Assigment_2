import { CUSTOMER_ROUTES } from "../../routes/customer.routes.js";
// TV1 — GET /products đã chạy; detail để TODO theo phạm vi bộ khung.
import {
  BadRequestException,
  Inject,
  Controller,
  Get,
  Param,
  Body,
  Post,
} from "@nestjs/common";
import { ProductsService } from "../../services/products.service.js";
@Controller(CUSTOMER_ROUTES.products.base)
export class ProductsController {
  constructor(
    @Inject(ProductsService) private readonly service: ProductsService,
  ) {}
  @Get(CUSTOMER_ROUTES.products.list) getProducts() {
    return this.service.getProducts();
  }
  @Get(CUSTOMER_ROUTES.products.detail)
  getProductDetail(@Param("id") id: string) {
    if (!id.trim()) {
      throw new BadRequestException("Thiếu mã sản phẩm.");
    }
    return this.service.getProductDetail(id);
  }
  @Post(CUSTOMER_ROUTES.products.checkStock)
  checkStock(@Param("id") id: string, @Body() body: unknown) {
    const value = body as Record<string, unknown>;
    if (typeof value?.size !== "string" || !Array.isArray(value.toppingIds) ||
        !value.toppingIds.every((item) => typeof item === "string")) {
      throw new BadRequestException("Thông tin món không hợp lệ.");
    }
    return this.service.checkStock(id, value.size, value.toppingIds, 1);
  }
}
