import { OrderStatus } from "./contracts.js";

export interface NewOrder {
  id: string;
  userId: string;
  discount: number;
  total: number;
  subtotal: number;
  promotionId: string | null;
}

export interface OrderRow {
  id: string;
  paymentCode: string;
  status: OrderStatus;
  subtotal: number;
  discount: number;
  total: number;
  expiresAt: Date;
}

export interface NewOrderItem {
  id: string;
  productId: string;
  productName: string;
  size: string;
  toppingIds: string[];
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface OrderRecord {
  id: string;
  userId: string;
  status: OrderStatus;
  subtotal: number;
  discount: number;
  total: number;
  stockReleased: boolean;
  expiresAt: Date;
}

export interface StockSnapshot {
  stock: number;
  version: number;
}

export interface SizeOption {
  name: string;
  extraPrice: number;
}

export interface ToppingOption {
  id: string;
  name: string;
  price: number;
}

export interface ProductPricing {
  id: string;
  name: string;
  price: number;
  sizes: SizeOption[];
  toppings: ToppingOption[];
}
