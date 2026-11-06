# Mở file nào để code

Phân công hiện hành: TV1 sản phẩm/khuyến mãi/Docker local; TV2 giỏ/checkout UI; TV3 Auth/CI; TV4 backend đơn/tồn; TV5 thanh toán/điểm; TV6 theo dõi đơn/CD. Xem mô tả từng người trong PHAN_CONG.md.

| Công việc            | TV  | Giao diện                                                           | Logic backend                                                                                               | SQL model                                          |
| -------------------- | --- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Menu/chi tiết món    | 1   | customer/main, customer/products, components/products               | services/products.service.ts                                                                                | models/product.model.ts                            |
| Khuyến mãi           | 1   | components/promotions/PromotionInput.tsx (khung, TV2 gắn vào trang) | services/promotions.service.ts                                                                              | models/promotion.model.ts                          |
| Giỏ hàng             | 2   | customer/cart, features/cart/cart.store.ts                          | Không có API giỏ trong phạm vi này                                                                          | Không có, giỏ lưu client                           |
| Checkout UI          | 2   | customer/checkout/CheckoutView.tsx, app/checkout/page.tsx           | Gọi API Orders của TV4, không tự viết logic backend                                                         | Không viết SQL trong view                          |
| Auth                 | 3   | views/auth, features/auth, lib/api-client.ts                        | controllers/auth, guards/, services/auth.service.ts, users.service.ts                                       | models/user.model.ts                               |
| Đặt/hủy đơn backend  | 4   | UI thuộc TV2/TV6                                                    | controllers/customer/orders.controller.ts, services/orders.service.ts                                       | models/order.model.ts                              |
| Giữ/hoàn tồn         | 4   | Không có trang riêng                                                | services/inventory.service.ts                                                                               | models/inventory.model.ts                          |
| Thanh toán           | 5   | customer/payment                                                    | controllers/customer/payments.controller.ts, services/payments.service.ts, gateways/mock-payment.gateway.ts | models/payment.model.ts                            |
| Điểm thưởng          | 5   | Kết quả lấy từ API                                                  | services/loyalty.service.ts                                                                                 | models/loyalty.model.ts; DB trigger cộng tổng điểm |
| Kết quả thanh toán   | 6   | customer/payment-status                                             | Gọi API Payments TV5                                                                                        | TV5 sở hữu PaymentModel                            |
| Lịch sử/chi tiết đơn | 6   | customer/orders                                                     | controllers/customer/customer-orders.controller.ts, services/customer-orders.service.ts                     | models/customer-order.model.ts                     |
| Quy tắc trạng thái   | 6   | Không có trang nhân viên                                            | services/order-state.service.ts                                                                             | Phối hợp OrderModel TV4                            |
| Docker local         | 1   | frontend/Dockerfile.todo                                            | backend/Dockerfile.todo, docker-compose.yml                                                                 | Dùng DB/seed có sẵn                                |
| CI/required checks   | 3   | Không có trang                                                      | .github/workflows/ci.yml và thiết lập GitHub                                                                | Không viết SQL                                     |
| CD/production/E2E    | 6   | Smoke URL web                                                       | Dùng image TV1 và CI TV3; tests/e2e                                                                         | Không sửa schema tùy tiện                          |

Đường dẫn customer/components ở cột giao diện tính từ frontend/src/views hoặc frontend/src theo tên thư mục. services/models/controllers tính từ backend/src. Chi tiết đầy đủ nằm trong PHAN_CONG.md.

Route API tập trung trong backend/src/routes/customer.routes.ts, auth.routes.ts, system.routes.ts và được controller dùng trực tiếp. Route frontend nằm trong frontend/src/app. Khuyến mãi hiện là service nội bộ khi tạo đơn; chưa có API preview riêng.

SQL tạo/sửa cấu trúc ở backend/database, truy vấn runtime ở models, nghiệp vụ ở services. Với schema đã áp dụng, tạo migration mới từ 004, không sửa 001/002.
