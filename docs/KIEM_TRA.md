# Kiểm tra bộ khung

Đã kiểm tra tại thời điểm bàn giao:

- TypeScript frontend/backend: pass.
- Production build Next.js và NestJS: pass.
- 4 test API trong tổng 16 test: menu seed, health sample trung thực, API khung 501, lỗi DB không lộ nội dung lỗi và không fallback seed.
- HTTP smoke production với sample API: trang chính render sản phẩm/giá; 9 route khung trả 200; ngắt backend thì trang chính hiện lỗi có nút thử lại.

Giới hạn:

- Đã chạy 001/002/003 và 12 test database trên PGlite (engine PostgreSQL WebAssembly): kiểm tra ràng buộc, trigger, dữ liệu mẫu, seed lặp, khóa chi tiết và transaction thanh toán + điểm. Chưa kiểm tra PostgreSQL server nhiều kết nối vì môi trường không có PostgreSQL/Docker; vẫn cần db:check/migrate/seed và test tranh tồn trên server của nhóm.
- Chưa kiểm tra trực quan bằng browser: không tải được Chromium trong môi trường này. Cần mở trang ở desktop và 360px để rà lại hiển thị và thao tác tìm kiếm/lọc.
- Chưa có E2E nghiệp vụ checkout, Auth/JWT, transaction đặt đơn hoặc thanh toán vì các phần này chủ ý chỉ là file TODO.
- CI được thêm cấu hình; kết quả chạy trên GitHub phụ thuộc quyền Actions của repo.
