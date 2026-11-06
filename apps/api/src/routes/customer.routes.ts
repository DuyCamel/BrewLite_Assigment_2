// Khai báo URL tập trung. Controller dùng các hằng này qua decorator NestJS.
// TV1 products, TV4 đặt/hủy, TV5 payments, TV6 đọc đơn. KHÔNG viết SQL/nghiệp vụ ở route.
export const CUSTOMER_ROUTES = {
  products: { base: "products", list: "", detail: ":id", checkStock: ":id/check-stock" },
  orders: {
    base: "orders",
    create: "",
    validatePromotion: "validate-promotion",
    mine: "me",
    detail: ":id",
    cancel: ":id/cancel",
    retryPayment: ":id/retry-payment",
  },
  payments: {
    base: "payments",
    create: "",
    status: ":id",
    reconcile: ":id/reconcile",
  },
} as const;
