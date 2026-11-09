# ADR 002: Kiến trúc phân lớp với Next.js, NestJS và SQL thuần qua `pg` Pool + Migration tự quản

- **Trạng thái:** Đã áp dụng

## Bối cảnh

Hệ thống bắt buộc sử dụng Next.js, NestJS và PostgreSQL. Các nghiệp vụ cốt lõi của BrewLite đòi hỏi kiểm soát chặt chẽ giao dịch cơ sở dữ liệu (giữ tồn kho nguyên liệu theo công thức món, chốt giá đơn hàng, xử lý webhook/thanh toán lặp và tự động hết hạn đơn/QR).

## Quyết định

1. **Frontend (`apps/web`):** Next.js 15 App Router theo hướng mobile-first; tách lớp `app/` (routing), `views/` (màn hình), `components/` (UI tái sử dụng), `features/` (giỏ hàng/xác thực ở `localStorage`) và `lib/` (HTTP client).
2. **Backend (`apps/api`):** NestJS phân lớp **Controller → Service → Model**, kết nối PostgreSQL trực tiếp qua `pg.Pool` (`DatabaseService`) thay vì dùng ORM nặng.
3. **Migration (`apps/api/scripts/database.ts`):** Dùng các tệp SQL đánh số trong `apps/api/database/`, chạy trong transaction có `pg_advisory_xact_lock` và kiểm tra toàn vẹn bằng băm SHA-256 trong bảng `schema_migrations`. Kiểm thử đơn vị/tích hợp dùng `@electric-sql/pglite` chạy cùng bộ SQL schema.

## Phương án thay thế đã cân nhắc

- **Sử dụng Prisma hoặc TypeORM:** Tiện sinh kiểu dữ liệu nhưng khó dùng chung trực tiếp với các câu lệnh khóa dòng/cập nhật nguyên tử (`UPDATE ... WHERE stock >= $1`) và khó chạy nguyên văn các tệp SQL migration trên PGlite trong unit/integration test mà không cần dịch vụ PostgreSQL rời.

## Hệ quả

- **Ưu điểm:** Kiểm soát chính xác từng câu lệnh SQL, khóa dòng (`FOR UPDATE`) và phạm vi `BEGIN/COMMIT/ROLLBACK` qua `DatabaseService.withTransaction()`; phát hiện ngay hành vi sửa trái phép migration cũ nhờ checksum SHA-256.
- **Hạn chế:** Phải tự viết câu lệnh SQL và ánh xạ dữ liệu trong lớp `models/`; các migration phụ thuộc dữ liệu danh mục (`003`–`006`, `008`) cần thứ tự `db:migrate -> db:seed -> db:migrate` khi dựng DB mới.
