import { BadRequestException } from "@nestjs/common";
import type { ProductPricing } from "../types/order.types.js";

export function calculateUnitPrice(
  product: ProductPricing,
  size: string,
  toppingIds: string[],
): number {
  // 1. Tìm size trong product.sizes; không có thì ném BadRequestException
  const sizeOption = product.sizes.find((s) => s.name === size);
  if (!sizeOption) {
    throw new BadRequestException(
      `Size ${size} không thuộc món ${product.name}`,
    );
  }

  // 2. Topping lặp: so độ dài mảng với độ dài new Set(toppingIds)
  if (toppingIds.length > new Set(toppingIds).size) {
    throw new BadRequestException("Topping bị trùng");
  }

  // 3. Cộng giá từng topping; id không thuộc món thì ném BadRequestException
  let toppingTotal = 0;
  for (const id of toppingIds) {
    const topping = product.toppings.find((t) => t.id === id);
    if (!topping) {
      throw new BadRequestException(
        `Topping ${id} không thuộc món ${product.name}`,
      );
    }
    toppingTotal += topping?.price;
  }

  return toppingTotal + sizeOption.extraPrice + product.price;
}
