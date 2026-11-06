# Hướng dẫn và bàn giao phần TV6 (theo dõi đơn, deploy, smoke)

## 1. Trạng thái phần TV6

| Việc                                                             | Trạng thái                                                                   | Nằm ở đâu                                                        |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| API đọc đơn của chính user (`GET /orders/me`, `GET /orders/:id`) | Xong, có guard JWT của TV3                                                   | `backend/src/controllers/customer/customer-orders.controller.ts` |
| Quy tắc chuyển trạng thái đơn (khớp trigger `002`)               | Xong, có test                                                                | `backend/src/services/order-state.service.ts`                    |
| Health check có kiểm tra DB (503 khi DB lỗi)                     | Xong                                                                         | `backend/src/controllers/system/health.controller.ts`            |
| Trang Đơn của tôi, Chi tiết đơn, Kết quả thanh toán              | Xong                                                                         | `frontend/src/views/customer/orders/`, `.../payment-status/`     |
| Frontend gửi token đăng nhập khi gọi `/orders/*`                 | Xong (đọc phiên của TV3)                                                     | `frontend/src/lib/client-api.ts`                                 |
| Smoke test sau deploy                                            | Xong                                                                         | `scripts/smoke.mjs`, chạy bằng `node scripts/smoke.mjs`          |
| Nút hủy đơn gọi API TV4                                          | Đã nối `POST /orders/:id/cancel`; cần E2E xác minh trên môi trường chạy thật | `OrderDetailView.tsx`                                            |
| E2E toàn luồng (menu → giỏ → đăng nhập → thanh toán → PAID)      | Chưa làm được: thanh toán TV5 vẫn là khung 501                               | `tests/e2e/checkout.spec.todo.ts`                                |
| Workflow CD (image, registry, deploy, rollback)                  | Chưa làm: nhóm chưa chốt nơi hosting                                         | xem mục 3                                                        |

## 2. Smoke test sau deploy

Chỉ cần Node 22 trở lên, không cài thêm gói. Script chỉ đọc dữ liệu, không tạo hay sửa đơn.

```sh
SMOKE_API_URL=https://<api> SMOKE_WEB_URL=https://<web> node scripts/smoke.mjs
```

Trên Windows PowerShell:

```powershell
$env:SMOKE_API_URL="https://<api>"; $env:SMOKE_WEB_URL="https://<web>"; node scripts/smoke.mjs
```

Muốn kiểm tra thêm đăng nhập và đọc đơn, đặt thêm `SMOKE_EMAIL` và `SMOKE_PASSWORD` của một tài khoản thử riêng (không dùng tài khoản thật). Không để mật khẩu trong file hay commit.

Các bước kiểm tra: `/health` phải là `database: "up"` (sample mode bị coi là lỗi), `/products` có món, `/orders/me` không token hoặc token rác phải 401, trang web trả 200, và nếu có tài khoản thử thì đăng nhập, đọc `/orders/me` được 200, đơn không tồn tại trả 404. Script thoát mã 1 khi có bước lỗi nên CD dùng được để quyết định rollback.

Chạy thử local sau `npm run dev` (không đặt biến thì mặc định `localhost:4000` và `localhost:3000`): `node scripts/smoke.mjs`. Ở máy local mật khẩu mẫu của seed nằm trong `backend/database/README.md`.

## 3. Checklist deploy và rollback (chưa phụ thuộc nhà cung cấp hosting)

Trước khi deploy:

1. CI xanh trên `main` (job `check`).
2. Có secret production riêng, không commit: `JWT_SECRET` (ngẫu nhiên, 32 ký tự trở lên, không chứa `local_only` hay `replace_`), `DB_PASSWORD`, `DB_USER`, `DB_NAME`, `DB_HOST`, `FRONTEND_ORIGIN` (đúng URL web production, không dùng `*`).
3. Khi build web, đặt `NEXT_PUBLIC_API_BASE_URL` là URL API công khai. Biến này được nhúng vào bundle lúc build, nên đổi URL phải build lại web. Không đặt secret vào biến `NEXT_PUBLIC_*`.
4. Chạy migration trước khi chuyển lưu lượng: `npm run db:migrate`. Không sửa đè `001` và `002` đã áp dụng; thay đổi schema dùng migration mới từ `004`.
5. Dùng HTTPS cho cả web và API (token đăng nhập gửi qua header `Authorization`).

Sau deploy: chạy smoke test ở mục 2. Có bước lỗi thì rollback.

Rollback: giữ lại image và tag của bản chạy tốt trước đó, khi lỗi thì triển khai lại tag cũ rồi chạy smoke lần nữa. Migration chỉ thêm (không xóa cột hay bảng đang dùng) thì bản code cũ vẫn chạy được với DB mới. Nếu migration có thay đổi phá vỡ, cần sao lưu DB trước khi deploy.

Khi nhóm chốt hosting, workflow CD nên có thứ tự: build image từ Docker của TV1, đẩy lên registry, deploy, chạy `node scripts/smoke.mjs`, và tự rollback nếu smoke lỗi. Chỉ chọn nhà cung cấp và điền secret khi cả nhóm đã thống nhất.

## 4. Điểm cần báo TV1 và TV3 (đọc từ code, chưa chạy Docker để xác nhận)

- `docker-compose.yml` ở service `api` không truyền `JWT_SECRET` và không có `env_file`. `.dockerignore` ở gốc repo loại `.env` khỏi image. `main.ts` kiểm tra `JWT_SECRET` khi khởi động, nên container `api` nhiều khả năng sẽ dừng ngay khi chạy bằng Docker. Cần TV1 và TV3 thêm `JWT_SECRET: ${JWT_SECRET:?...}` (và `JWT_EXPIRES_IN_SECONDS` nếu muốn) vào `environment` của `api`.
- Image `api` đặt `NODE_ENV=production`, mà production từ chối secret chứa `local_only`. Khi chạy Docker thử local, cần một `JWT_SECRET` riêng, không phải giá trị mẫu trong `.env_vidu`.
- `FRONTEND_ORIGIN` trong compose đang cố định là `http://localhost:3000`; production cần đổi theo URL thật.

## 5. Kiểm tra quyền sở hữu và chuyển trạng thái

Đã có test trong `backend/test/customer-orders.test.ts` và `customer-orders.sql.test.ts` (quy tắc trạng thái, đọc đơn theo user, SQL thật trên PGlite). Chạy bằng `npm test` ở thư mục gốc.

## 6. Trang kết quả thanh toán với luồng SePay

Hiện thanh toán thật chỉ có webhook SePay (`POST /webhooks/sepay`): khi tiền về, backend tạo payment `SUCCEEDED`, đổi đơn sang `PAID` và ghi điểm trong một transaction. Trước lúc đó đơn vẫn `PENDING` và chưa có dòng payment nào, nên trang `/payment-status` coi đó là "đang chờ" và tiếp tục polling `GET /orders/:id` (tối đa 60 giây, 2 giây một lần) thay vì báo ngay "chưa thanh toán". Hết 60 giây thì hiện nút "Kiểm tra lại"; không tự kết luận thất bại.

Thử local khi chưa có trang `/payment` của TV5: tạo đơn qua giao diện, mở `/payment-status?orderId=<mã đơn đầy đủ>`, rồi ở terminal khác chạy:

```sh
SEPAY_WEBHOOK_API_KEY=<giá trị trong .env của API> node scripts/simulate-sepay.mjs <mã đơn đầy đủ> <tổng tiền>
```

Tổng tiền phải đúng bằng tổng đơn, nếu không webhook trả 400. Script chỉ chạy với API trên localhost.
