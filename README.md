# BrewLite

Khung đồ án Công nghệ phần mềm dùng Next.js, NestJS và PostgreSQL. Chỉ giao diện khách hàng.

## Chạy bằng PostgreSQL

Yêu cầu Node.js 22+, npm và PostgreSQL (hoặc Docker Desktop).

1. Clone repo và chuyển sang nhánh `scaffold/brewlite-customer` nếu chưa merge PR.
2. Tại thư mục gốc, Windows: `copy .env_vidu .env`; macOS/Linux: `cp .env_vidu .env`.
3. Nếu dùng Docker: `docker compose up -d db`. Nếu có PostgreSQL sẵn: tạo database/user theo `.env`, sửa DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME cho đúng.
4. `npm install` (các lần sau dùng `npm ci` theo lockfile).
5. `npm run db:check` → `npm run db:migrate` → `npm run db:seed` → `npm run db:migrate`.
6. `npm run dev` rồi mở http://localhost:3000. API: http://localhost:4000/products; health: http://localhost:4000/health.

Không cần tạo .env riêng trong frontend/backend. Cả hai đọc .env tại gốc repo. Chạy lệnh từ gốc bằng npm workspace scripts.
`.env_vidu` chứa tài khoản ví dụ local, không phải thông tin đăng nhập thật; `.env` đã được gitignore.
SQL nằm trong `backend/database/001_schema.sql`, `002_integrity.sql`, `003_seed.sql`. Xem [hướng dẫn và dữ liệu test](backend/database/README.md). Seed chạy lại không ghi đè sản phẩm/tồn đã có. Sửa dữ liệu bằng SQL/migration khi cần, chưa cần màn hình quản trị.
Các migration catalog cần sản phẩm có sẵn; lần migrate đầu tiên sẽ tự hoãn chúng nếu database đang trống. Sau khi seed, chạy migrate lần nữa để áp dụng công thức và ảnh sản phẩm.
Nếu cổng 3000/4000/5432 đang dùng, giải phóng cổng hoặc đổi cấu hình đồng bộ (API_PORT/API_BASE_URL/FRONTEND_ORIGIN).

## Xem thử chưa cần cài database

Đổi `PRODUCT_DATA_SOURCE=sample` trong `.env`, chạy `npm run dev`. API đọc cùng file seed và health ghi rõ DB chưa kiểm tra. Không tự chuyển sang sample khi DB lỗi. Nghiệm thu phải dùng `postgres`.

## Kiểm tra và build

```sh
npm run typecheck
npm test
npm run build
npm run start -w backend
npm run start -w frontend
```

Build frontend không yêu cầu API/DB đang chạy; trang chính lấy dữ liệu theo request lúc runtime.

## Tài liệu cho nhóm

Backend tách rõ `routes/` → `controllers/` → `services/` → `models/`; xem [Vị trí viết logic và SQL](docs/VI_TRI_CODE.md).

- [Phân công 6 thành viên](docs/PHAN_CONG.md)
- [Lưu ý từng module](docs/LUU_Y_MODULE.md)
- [Bản đồ file cần sửa](docs/VI_TRI_CODE.md)
- [Cấu trúc thư mục](docs/CAU_TRUC.md)
- [Quy ước code](docs/QUY_UOC.md)
- [Phạm vi bộ khung](docs/YEU_CAU_BO_KHUNG.md)
- [Database và phần cần bổ sung](backend/database/README.md)

## Lưu ý tiếp tục triển khai

Auth (đăng ký/đăng nhập, JWT, `JwtAuthGuard`) đã có. Để dùng chuyển khoản, cấu hình `NEXT_PUBLIC_VIETQR_BANK_ID`, `NEXT_PUBLIC_VIETQR_ACCOUNT_NO`, `NEXT_PUBLIC_VIETQR_ACCOUNT_NAME` trong `.env`, đồng thời cấu hình SePay gọi webhook `POST /webhooks/sepay` và đặt `SEPAY_WEBHOOK_API_KEY` khớp API key webhook. Nội dung chuyển khoản QR mới là `BREWLITE-ORDER-<UUID đơn>`; webhook kiểm tra mã đơn và số tiền từ database trước khi xác nhận. Mã QR cũ chỉ chứa UUID đầy đủ vẫn được chấp nhận. Đây là tích hợp demo; cần kiểm thử với tài khoản/test environment của nhà cung cấp trước khi thu tiền thật.
Phân công đã cân lại: TV1 làm sản phẩm + khuyến mãi + Docker local; TV2 làm giỏ + giao diện checkout; TV3 làm Auth/bảo mật + CI/required checks; TV4 làm backend đơn/tồn; TV5 làm thanh toán/điểm; TV6 làm theo dõi đơn + CD/production và ghép E2E. Những phần TODO chưa được coi là hoàn thành đề Assignment 2.
