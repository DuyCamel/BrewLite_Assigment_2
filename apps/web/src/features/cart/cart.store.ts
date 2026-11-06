// TV2 — Giỏ hàng được lưu trong trình duyệt; giá chính thức do API tạo đơn tính lại.
import type { Product } from "@/types/product";

export const CART_STORAGE_KEY = "cart";

export interface CartItem {
  productId: string;
  size: string;
  toppingIds: string[];
  quantity: number;
  note: string;
}

export type CartProduct = Pick<Product, "id" | "price" | "sizes" | "toppings">;

export function getCartItemKey(
  item: Pick<CartItem, "productId" | "size" | "toppingIds">,
): string {
  return JSON.stringify([
    item.productId,
    item.size,
    [...item.toppingIds].sort(),
  ]);
}

function isCartItem(value: unknown): value is CartItem {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.productId === "string" &&
    item.productId.length > 0 &&
    typeof item.size === "string" &&
    Array.isArray(item.toppingIds) &&
    item.toppingIds.every((id) => typeof id === "string") &&
    Number.isInteger(item.quantity) &&
    (item.quantity as number) >= 1 &&
    (item.quantity as number) <= 99 &&
    (item.note === undefined || typeof item.note === "string")
  );
}

function save(items: CartItem[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event("brewlite:cart-changed"));
}

export class CartStore {
  addItem(item: CartItem): CartItem[] {
    if (!isCartItem(item))
      throw new RangeError("Thông tin món trong giỏ không hợp lệ.");
    const items = this.restoreCart();
    const key = getCartItemKey(item);
    const existingIndex = items.findIndex(
      (current) => getCartItemKey(current) === key,
    );
    if (existingIndex < 0) {
      items.push({
        ...item,
        toppingIds: [...new Set(item.toppingIds)],
        note: item.note ?? "",
      });
    } else {
      const existing = items[existingIndex];
      const quantity = existing.quantity + item.quantity;
      if (quantity > 99)
        throw new RangeError("Mỗi món chỉ có thể đặt tối đa 99 phần.");
      const notes = [existing.note, item.note]
        .map((note) => note?.trim())
        .filter(Boolean);
      items[existingIndex] = {
        ...existing,
        quantity,
        note: [...new Set(notes)].join(" · "),
      };
    }
    save(items);
    return items;
  }

  updateQuantity(itemKey: string, quantity: number): CartItem[] {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      throw new RangeError("Số lượng phải là số nguyên từ 1 đến 99.");
    }
    const items = this.restoreCart().map((item) =>
      getCartItemKey(item) === itemKey ? { ...item, quantity } : item,
    );
    save(items);
    return items;
  }

  removeItem(itemKey: string): CartItem[] {
    const items = this.restoreCart().filter(
      (item) => getCartItemKey(item) !== itemKey,
    );
    save(items);
    return items;
  }

  calculateSubtotal(products: CartProduct[]): number {
    const items = this.restoreCart();
    return items.reduce((subtotal, item) => {
      const product = products.find(
        (candidate) => candidate.id === item.productId,
      );
      if (!product) return subtotal;
      const size = product.sizes.find((option) => option.name === item.size);
      if (!size) return subtotal;
      const toppings = item.toppingIds.reduce((sum, id) => {
        const topping = product.toppings.find((option) => option.id === id);
        return sum + (topping?.price ?? 0);
      }, 0);
      return (
        subtotal + (product.price + size.extraPrice + toppings) * item.quantity
      );
    }, 0);
  }

  restoreCart(): CartItem[] {
    if (typeof window === "undefined") return [];
    try {
      const parsed: unknown = JSON.parse(
        window.localStorage.getItem(CART_STORAGE_KEY) ?? "[]",
      );
      if (!Array.isArray(parsed)) return [];
      const validItems = parsed.filter(isCartItem).map((item) => ({
        ...item,
        toppingIds: [...new Set(item.toppingIds)],
        note: item.note ?? "",
      }));
      // Dữ liệu cũ của màn hình chi tiết được đưa về cùng dạng chuẩn và gộp theo cấu hình món.
      const merged = new Map<string, CartItem>();
      for (const item of validItems) {
        const key = getCartItemKey(item);
        const existing = merged.get(key);
        if (!existing) merged.set(key, item);
        else
          merged.set(key, {
            ...existing,
            quantity: Math.min(99, existing.quantity + item.quantity),
          });
      }
      return [...merged.values()];
    } catch {
      return [];
    }
  }

  clearAfterPayment(): void {
    save([]);
  }
}

export const cartStore = new CartStore();
