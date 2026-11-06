# Bộ SQL BrewLite

| File              | Mục đích                                                                                                   |
| ----------------- | ---------------------------------------------------------------------------------------------------------- |
| 001_schema.sql    | Schema, constraint, trigger và các phần mở rộng database                                                    |
| 002_seed.sql      | Dữ liệu demo đa dạng, không ghi đè dữ liệu đang có                                                         |

## Chạy từ thư mục gốc

1. Copy `.env_vidu` thành `.env`, sửa tài khoản PostgreSQL.
2. `npm run db:check`
3. `npm run db:migrate` chạy schema trong transaction, ghi tên/checksum vào schema_migrations.
4. `npm run db:seed` chạy 003 trong transaction riêng.
5. `npm run db:migrate` lần nữa để áp dụng catalog công thức và ảnh cho các sản phẩm vừa seed.

Có thể chạy SQL thủ công bằng psql/pgAdmin theo đúng thứ tự `001_schema.sql` rồi `002_seed.sql`. Bọc mỗi file trong transaction.
Không chạy seed tự động khi khởi động backend hoặc trên production. Dữ liệu demo dùng tiền tố `demo-`, email miền `.test`.

Nếu đã chạy bộ cũ chỉ có products: 001 giữ bảng và dữ liệu products, bổ sung các bảng còn thiếu. Tám món cũ được giữ bằng ON CONFLICT DO NOTHING.
Không sửa 001/002 sau khi runner đã áp dụng; viết 004_ten_thay_doi.sql và chạy db:migrate. Nếu đã thử phiên bản trước của cùng PR trên DB nháp, nên dùng một database test mới thay vì tự xóa lịch sử migration.

## 002 kiểm tra gì

- Giá/tồn/điểm không âm; số lượng 1–99; size/topping hợp lệ, không trùng; đơn giá không âm và tổng dòng đúng theo phép nhân.
- Email unique không phân biệt hoa thường, password lưu bcrypt hash; mã giảm giá unique, phần trăm 1–100, thời hạn hợp lệ.
- Khóa ngoại; subtotal bằng tổng dòng; total = subtotal − discount; giảm không vượt tiền hàng.
- Đơn mới PENDING; chỉ cho phép các cạnh trạng thái đã quy định; không sửa giá chốt/chủ đơn; chi tiết chỉ được lập trong transaction tạo đơn và trước khi có payment; không xóa đơn đã trả tiền.
- Payment bắt đầu PROCESSING trên đơn PENDING, tiền bằng tổng đơn; key unique, tối đa một PROCESSING/SUCCEEDED trên một đơn; attempt cuối không sửa/xóa.
- Khi COMMIT: PAID/PREPARING/READY/COMPLETED phải có một Payment SUCCEEDED và đúng một EARN. Không hủy/kết luận thất bại nếu Payment còn PROCESSING.
- EARN chỉ cho đúng chủ đơn đã trả tiền; unique theo đơn; không sửa/xóa sổ điểm. Trigger tự cập nhật users.loyalty_points; tổng điểm phải khớp ledger tại COMMIT.

**TV5 chỉ INSERT loyalty_transactions, không cộng users.loyalty_points lần nữa.** Việc chốt Payment, PAID và INSERT EARN phải trong cùng transaction. Với đơn miễn phí, EARN được phép có 0 điểm. Cách tính demo là 1 điểm/10.000đ; service vẫn cần chốt quy tắc của nhóm.

TV4 vẫn phải tính đơn giá chính thức từ catalog trong service; database kiểm tra snapshot và phép tính, không tính lại lịch sử theo giá catalog mới.

002 không thay JWT/kiểm tra quyền sở hữu ở API, không gọi gateway, không tự giữ/hoàn tồn hoặc tự đặt PAID. TV4 vẫn dùng UPDATE theo stock/version và cùng client transaction. Index/constraint chống ghi sai không thay cơ chế idempotency trả lại kết quả trong service.

## SePay sandbox

Migration `004_sepay.sql` bổ sung metadata giao dịch SePay. Endpoint `POST /webhooks/sepay`
nhận webhook có header `Authorization: Apikey <SEPAY_WEBHOOK_API_KEY>`. Nội dung chuyển
khoản phải chứa `BREWLITE-ORDER-<order UUID>` và số tiền phải bằng `orders.total`.
Chỉ webhook hợp lệ mới được ghi payment `SUCCEEDED`, chuyển đơn `PENDING` thành `PAID`
và ghi `EARN` trong cùng transaction. Gửi lại cùng `id` SePay là thao tác idempotent.

## Tồn kho nguyên liệu

Migration `005_ingredient_inventory.sql` bổ sung `ingredients`, công thức theo size
(`product_recipes`), công thức topping (`topping_recipes`) và lượng đã giữ theo đơn
(`order_ingredient_reservations`). Khi migration này có mặt, tạo đơn sẽ trừ nguyên liệu
theo công thức trong cùng transaction; hủy/thất bại sẽ hoàn đúng lượng đã giữ. `products.stock`
chỉ còn là đường tương thích cho database cũ chưa có migration 005.

Migration 005 tạo công thức `piece` tạm cho dữ liệu cũ để không làm mất tồn khi nâng cấp.
Trước khi demo nghiệp vụ pha chế, cần thay các dòng này bằng định lượng thực tế theo `ml`,
`gram` hoặc `piece`; không dùng giá trị tạm đó làm công thức sản phẩm chính thức.

Migration `006_recipe_catalog.sql` là công thức chính thức của menu: bảng định lượng là
size S, size M bằng 125% và size L bằng 150%, làm tròn lên từng nguyên liệu. Tồn đầu kỳ
được đặt là 5.000 theo đơn vị của từng nguyên liệu (5.000 ml, 5.000 gram hoặc 5.000 piece).
Topping được quy ước 50 gram trân châu và 30 gram kem sữa mỗi phần.

## Dữ liệu trong 003

| Bảng                 | Số bản ghi |
| -------------------- | ---------: |
| products             |         40 |
| users                |         24 |
| promotions           |          8 |
| orders               |         84 |
| order_items          |        168 |
| payments             |         82 |
| loyalty_transactions |         48 |

Mỗi trạng thái đơn có 12 bản ghi: PENDING, PAYMENT_FAILED, PAID, PREPARING, READY, COMPLETED, CANCELLED. Có thanh toán WALLET/CARD, retry sau thất bại, PROCESSING, đơn chưa thanh toán quá hạn, sản phẩm stock=0/1/2 và sản phẩm còn nhiều. Ảnh vẫn NULL theo yêu cầu.

Khách mẫu: `khach01@brewlite.test` đến `khach24@brewlite.test`. Mật khẩu chung **BrewLite123!**, chỉ lưu bcrypt hash trong SQL. Đăng nhập được qua `POST /auth/login` hoặc trang `/login`, và dùng được để test DB.

| Mã giảm giá | Ca test                                                 |
| ----------- | ------------------------------------------------------- |
| WELCOME10   | Giảm 10%, đang hiệu lực                                 |
| GIAM15000   | Giảm 15.000đ, đơn tối thiểu 80.000đ                     |
| MIN100K     | Giảm 15%, đơn tối thiểu 100.000đ                        |
| HETHAN      | Hết hạn                                                 |
| CHUADEN     | Chưa tới thời gian áp dụng                              |
| TATMA       | Bị vô hiệu hóa                                          |
| GIAMTOIDA   | Mức giảm cố định lớn hơn tiền hàng để kiểm tra giới hạn |
| GIAM100     | Giảm 100%, kiểm tra đơn tổng bằng 0                     |

003 đánh dấu `003_demo_v1` trong seed_history, chạy lại sẽ bỏ qua cả bộ, không cộng điểm/hoàn tồn/ghi thêm đơn. Đây là snapshot test, không phải script phát lại mọi lần trừ tồn trong lịch sử. Muốn trở về bộ mẫu sạch, tạo DB test mới rồi chạy lại 001/002/003; không có lệnh reset phá dữ liệu tự động.

`seed/products.json` đồng bộ 40 món với 003 để chế độ PRODUCT_DATA_SOURCE=sample vẫn dùng cùng menu. Sample mode chỉ phục vụ xem menu, không mô phỏng toàn bộ DB.

## Kiểm thử

`npm test` chạy kiểm tra API và database. Database dùng PGlite (PostgreSQL biên dịch WebAssembly) để chạy SQL và PL/pgSQL trong môi trường không có Docker; không thay PostgreSQL server của sản phẩm. Vẫn cần kiểm tra kết nối server, tranh chấp nhiều client, quyền extension/role và cấu hình triển khai trên PostgreSQL thật.
