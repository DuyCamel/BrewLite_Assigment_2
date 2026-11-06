import test from "node:test";
import assert from "node:assert/strict";
import { BadRequestException } from "@nestjs/common";
import { calculateUnitPrice } from "../src/services/order-pricing.js";
import type { ProductPricing } from "../src/types/order.types.js";

const product: ProductPricing = {
  id: "tra-dao",
  name: "Trà đào",
  price: 30000,
  sizes: [
    { name: "M", extraPrice: 5000 },
    { name: "L", extraPrice: 10000 },
  ],
  toppings: [
    { id: "tran-chau", name: "Trân châu", price: 7000 },
    { id: "thach", name: "Thạch", price: 5000 },
  ],
};

test("size L + 2 topping: cộng giá gốc, phụ phí size và topping", () => {
  const price = calculateUnitPrice(product, "L", ["tran-chau", "thach"]);
  assert.equal(price, 52000);
});

test("size M không topping", () => {
  // điền: gọi calculateUnitPrice(product, "M", []) và so với 35000
  calculateUnitPrice(product, "M", []);
});

test("size không thuộc món bị từ chối", () => {
  assert.throws(
    () => calculateUnitPrice(product, "XL", []),
    BadRequestException,
  );
});

test("topping không thuộc món bị từ chối", () => {
  assert.throws(
    () => calculateUnitPrice(product, "L", ["khong-co"]),
    BadRequestException,
  );
});

test("topping trùng bị từ chối", () => {
  assert.throws(
    () => calculateUnitPrice(product, "L", ["thach", "thach"]),
    BadRequestException,
  );
});
