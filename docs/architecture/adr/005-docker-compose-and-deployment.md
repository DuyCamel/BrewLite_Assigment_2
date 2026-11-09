# ADR 005: Triển khai bằng Docker Compose và phân tách cấu hình theo môi trường

- **Trạng thái:** Đã áp dụng cho Local và CI; đang chờ hoàn thiện CD/Production ở Task 5.3–5.4

## Bối cảnh

Hệ thống gồm 3 thành phần chạy đồng thời (`web`, `api`, `db`) cùng các thông tin nhạy cảm (`JWT_SECRET`, `DB_PASSWORD`, `SEPAY_WEBHOOK_API_KEY`). Cần đảm bảo lập trình viên dựng được môi trường local nhất quán, CI tự động kiểm tra chất lượng trên mỗi PR, và không lộ secret hoặc khai báo khống hạ tầng production khi chưa triển khai thật.

## Quyết định

1. **Đóng gói container (`apps/web/Dockerfile`, `apps/api/Dockerfile`):** Dùng multi-stage build trên nền `node:22-alpine` (`dependencies -> builder -> runner` với `npm ci --omit=dev`).
2. **Môi trường Local (`docker-compose.yml`):** Chạy 3 dịch vụ `db` (`postgres:17-alpine` + volume `brewlite_data`), `api` (cổng `4000`, healthcheck gọi `GET /health`) và `web` (cổng `3000`, gọi nội bộ `http://api:4000`). Các cổng host chỉ bind vào `127.0.0.1`. Khi cần nhận webhook SePay từ ngoài vào máy local, bật `cloudflared tunnel` trên máy host.
3. **Môi trường CI (`.github/workflows/ci.yml`):** Chạy trên GitHub Actions (`ubuntu-latest`, Node 22) theo chuỗi `npm ci -> typecheck -> lint -> test -> build`, dùng PGlite in-memory cho bộ test.
4. **Quản lý cấu hình (`apps/api/src/config/environment.ts`):** Kiểm tra nghiêm ngặt khi khởi động (`JWT_SECRET >= 32` ký tự, từ chối secret mẫu khi `NODE_ENV=production`, kiểm tra tỷ lệ `ORDER_TTL_MINUTES >= 2 * QR_TTL_MINUTES`).

## Phương án thay thế đã cân nhắc

- **Chạy rời từng tiến trình không qua Docker hoặc nhúng cứng cấu hình:** Dễ lệch phiên bản Node/PostgreSQL giữa các thành viên và dễ lộ khóa bí mật lên Git.

## Hệ quả

- **Ưu điểm:** Cấu trúc image và biến môi trường đã sẵn sàng để tái sử dụng cho CD và môi trường production (VPS chạy Docker Compose kèm Reverse Proxy HTTPS hoặc PaaS như Render/Railway) mà không phải sửa mã nguồn.
- **Hạn chế:** Hiện tại trong repository chưa có workflow CD (`.github/workflows/cd.yml`) và chưa có URL production thực tế; sơ đồ triển khai phải phản ánh đúng trạng thái hiện tại này cho đến khi hoàn tất Task 5.3–5.4.
