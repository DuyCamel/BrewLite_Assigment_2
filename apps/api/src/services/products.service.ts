// TV1 — Menu đã hoạt động; hoàn thiện getProductDetail(id) bằng ProductModel.findById và 404 khi không có.
// TODO TV1: nối getProductDetail vào ProductsController cho /products/[id]; giữ giá chốt đơn ở service TV4.
import {
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ProductModel } from "../models/product.model.js";
@Injectable()
export class ProductsService {
  constructor(@Inject(ProductModel) private readonly model: ProductModel) {}
  async getProducts() {
    try {
      return await this.model.findAll();
    } catch {
      throw new ServiceUnavailableException(
        "Không tải được menu. Kiểm tra database và chạy migration/seed.",
      );
    }
  }

  async getProductDetail(id: string) {
    try {
      const product = await this.model.findById(id);
      if (!product) {
        throw new NotFoundException("Không tìm thấy sản phẩm.");
      }
      return product;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new ServiceUnavailableException(
        "Không tải được sản phẩm. Kiểm tra database và chạy migration/seed.",
      );
    }
  }
  checkStock(productId: string, size: string, toppingIds: string[], quantity: number) {
    return this.model.checkStock(productId, size, toppingIds, quantity);
  }
}
