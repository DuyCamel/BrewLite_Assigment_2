# Cấu trúc chương trình

Tổ chức theo vai trò giống repo PTTKHTTT: mở đúng thư mục là biết chỗ viết URL, xử lý request, logic hoặc SQL. Vẫn dùng Next.js và NestJS theo đề.

| Thư mục                 | Code gì tại đây                                                           | Ví dụ                                  |
| ----------------------- | ------------------------------------------------------------------------- | -------------------------------------- |
| backend/src/routes      | Định nghĩa URL tập trung, được controller sử dụng                         | customer.routes.ts, auth.routes.ts     |
| backend/src/controllers | Nhận request, decorator gắn route, gọi service, trả response              | customer/products.controller.ts        |
| backend/src/services    | Logic nghiệp vụ, validate, tính giá, quyết định transaction và trạng thái | products.service.ts, orders.service.ts |
| backend/src/models      | SQL SELECT/INSERT/UPDATE/DELETE, truy vấn tham số                         | product.model.ts, order.model.ts       |
| backend/src/config      | Kết nối DB, biến môi trường                                               | db.ts, environment.ts                  |
| backend/src/types       | Kiểu dữ liệu/contract, không viết SQL                                     | product.types.ts, contracts.ts         |
| backend/src/gateways    | Tích hợp dịch vụ ngoài, mô phỏng thanh toán                               | mock-payment.gateway.ts                |
| backend/database        | SQL tạo/sửa bảng, index, ràng buộc                                        | 001_schema.sql + 002_integrity.sql     |
| backend/database/seed   | Dữ liệu mẫu                                                               | products.json                          |
| frontend/src/app        | URL trang Next.js, import view                                            | cart/page.tsx                          |
| frontend/src/views      | Giao diện theo khu vực khách hàng và auth                                 | customer/main/HomeView.tsx             |
| frontend/src/features   | Logic phía trình duyệt, giỏ hàng, phiên đăng nhập                         | cart/cart.store.ts                     |
| frontend/src/components | Thành phần giao diện dùng chung                                           | products/ProductCard.tsx               |
| frontend/src/lib        | Client gọi backend                                                        | api.ts                                 |

## Luồng đang chạy

Trang chính → lib/api.ts → GET /products → routes/customer.routes.ts (đường dẫn) → controllers/customer/products.controller.ts → services/products.service.ts → models/product.model.ts → config/db.ts → PostgreSQL.

NestJS đăng ký controller tại app.module.ts. File routes là nguồn hằng đường dẫn được decorator sử dụng, không phải Express Router. Không khai báo một bộ URL khác trong controller.

## Chỗ viết logic và SQL

- Ví dụ tạo đơn: service OrdersService kiểm tra nghiệp vụ và điều phối transaction; OrderModel/InventoryModel viết INSERT/UPDATE, cùng nhận một PoolClient.
- Model không tự mở transaction riêng khi service đã truyền transaction client. Không đặt giá từ client làm giá chính thức.
- Controller không viết SQL hay logic tính tiền. Model không render view hay quyết định response HTTP của nghiệp vụ.
- app.module.ts hiện nối phần đã chạy và các controller khung. Khi hoàn thiện module, thêm service/model mới vào providers và inject chúng.
- models đã có đủ file khung theo nghiệp vụ, với method và TODO rõ người phụ trách. Chỉ ProductModel.findAll đang thực thi; các method còn lại chủ ý throw 501.
- Giỏ hàng hiện là state client; không tạo CartModel giả vì phạm vi chưa yêu cầu lưu giỏ ở database.

## Tài liệu liên quan

docs/PHAN_CONG.md mô tả việc từng người; docs/VI_TRI_CODE.md chỉ file cần sửa; docs/LUU_Y_MODULE.md ghi điểm dễ sai và cách phối hợp. UI checkout thuộc TV2, backend đơn/tồn thuộc TV4; khuyến mãi và Docker local thuộc TV1, CI thuộc TV3, CD thuộc TV6. Không có trang Admin/nhân viên.
