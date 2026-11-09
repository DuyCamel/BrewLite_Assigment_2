# BrewLite v1.0.0 — Release notes

> Điền các mục trong `< >` sau khi `scripts/smoke.mjs` đạt trên URL thật. Chưa có URL production được xác nhận thì không điền URL giả và không phát hành tag.

- **Ngày phát hành:** `<dd/mm/yyyy>`
- **Tag / commit:** `v1.0.0` / `<sha-7-ký-tự>`
- **Web (HTTPS):** `<https://WEB_DOMAIN>`
- **API (HTTPS):** `<https://API_DOMAIN>` · Health: `<https://API_DOMAIN>/health`
- **Image:** `ghcr.io/<chủ-repo-viết-thường>/brewlite-api|brewlite-web|brewlite-migrate` với tag `1.0.0` và `sha-<7 ký tự>`

## Tính năng

Luồng nghiệp vụ: xem menu → chọn size/topping → giỏ hàng → đặt đơn → thanh toán → theo dõi đơn.

- Menu và chi tiết món (`GET /products`, `GET /products/:id`), hiển thị mobile-first với trạng thái loading, rỗng, lỗi.
- Size, topping, mã khuyến mãi; giỏ hàng lưu ở trình duyệt, giữ nguyên khi tải lại trang hoặc thanh toán thất bại.
- Đăng ký, đăng nhập (JWT), quên/đặt lại mật khẩu.
- Đặt đơn: giá do máy chủ tính, trừ tồn kho trong cùng transaction; đơn quá hạn tự hủy và hoàn tồn.
- Thanh toán chuyển khoản bằng mã QR VietQR, xác nhận tự động qua webhook SePay; QR hết hạn được cấp lại một lần.
- Backend có API thanh toán mô phỏng Ví/Thẻ (`POST /payments`, có Idempotency-Key) và tích điểm đúng một lần khi đơn chuyển PAID.
- Lịch sử đơn, chi tiết đơn, trang kết quả thanh toán (tự kiểm tra lại trạng thái), hủy đơn khi còn hợp lệ.

## Hạ tầng và vận hành

- Local: `docker compose up --build` chạy web, API và PostgreSQL (`docker-compose.yml`).
- CI: lint, typecheck, test, build trên mỗi pull request (`ci.yml`).
- CD: push vào `main` hoặc tag `vX.Y.Z` → quality gate → build image gắn SHA/semver → push GHCR → deploy lên VPS → smoke test → tự rollback khi smoke lỗi (`cd.yml`).
- Production: VPS + Docker Compose, HTTPS tự động bằng Caddy; PostgreSQL chỉ nằm trong mạng nội bộ, không mở cổng ra internet; secret nằm trong `.env.prod` trên VPS và GitHub Secrets.
- Mỗi lần deploy sao lưu DB bằng `pg_dump` (giữ 5 bản) và chạy migration trước khi đổi api/web.
- Rollback: workflow `Rollback` hoặc `sh deploy.sh rollback <tag>`; chỉ đổi image, không hoàn tác migration.

## Giới hạn đã biết

- Một VPS duy nhất: không tự mở rộng, có khoảng gián đoạn ngắn khi đổi container.
- Rollback không hoàn tác migration; migration phải chỉ thêm để bản cũ vẫn chạy được.
- Dữ liệu seed gồm 24 tài khoản demo dùng chung mật khẩu mẫu; không dùng cho dữ liệu thật.
- Giao diện thanh toán hiện chỉ có QR chuyển khoản; Ví/Thẻ mô phỏng chỉ có ở API.
- Không có trang quản trị/nhân viên trong MVP.
- `<bổ sung các lỗi còn tồn tại khi phát hành>`

## Cách chạy và kiểm tra

- Chạy local, test, build, deploy, rollback: xem `README.md` và `docs/deployment.md`.
- Smoke test: `SMOKE_API_URL=<api> SMOKE_WEB_URL=<web> node scripts/smoke.mjs`.
- Demo trực tiếp luồng menu → giỏ → đăng nhập → đặt đơn → thanh toán → PAID: `<link video>`.
