# TV4 — Hướng dẫn trạng thái dự án và bàn giao cho trưởng nhóm

## 1. Phạm vi phụ trách

Theo phân công, TV4 phụ trách backend đơn hàng, tồn kho, transaction/rollback,
database migration và kiểm chứng concurrency. Phạm vi công việc bao gồm:

- Đặt/hủy đơn và hoàn tồn nguyên liệu an toàn.
- Kiểm tra công thức sản phẩm, size và topping trước khi đặt.
- Bảo đảm lỗi giữa transaction không để lại đơn hoặc cập nhật tồn một phần.
- Kiểm chứng hết hạn đơn, hoàn tất thanh toán và tính độc lập giữa nhiều đơn.
- Migration và kiểm thử DB liên quan đến các thay đổi trên.

## 2. Trạng thái công việc

### Đã triển khai

- Các kiểm tra đơn hàng và DB của TV4 được tổ chức theo cấu trúc test hiện tại;
  ba bài kiểm tra expiry-timezone, ingredient-reservation và order-isolation nằm
  trong `tests/e2e`.
- Logic giữ tồn và hoàn tồn dựa trên công thức `product_recipes` /
  `topping_recipes`; món thiếu công thức bị từ chối, không dùng tồn kho sản phẩm
  làm phương án dự phòng.
- Đã loại bỏ `products.stock` khỏi schema đang hoạt động, seed, API types và
  các luồng đọc/ghi liên quan. Migration mới
  `apps/api/database/010_product_inventory.sql` bỏ cột này trên DB hiện hữu;
  migration nền `001_schema.sql` không bị sửa để tránh sai checksum.
- `products.version` được giữ nguyên. Việc khóa lạc quan tồn kho dùng
  `ingredients.version` vì nhiều sản phẩm có thể cùng tiêu thụ một nguyên liệu.
  Reservation cập nhật nguyên liệu theo điều kiện version và lượng tồn; khi
  gặp version cũ sẽ đọc lại, thử lại hoặc trả conflict nếu tồn đã hết.
- Nguyên liệu được xử lý theo thứ tự ID ổn định để giảm nguy cơ deadlock.
  Reservation và hoàn tồn vẫn nằm trong transaction của đơn hàng.
- Có kiểm thử cho migration lặp lại và việc giữ `products.version`, khả năng bán
  theo công thức size/topping, thiếu công thức, rollback, hoàn tồn một lần, cập
  nhật version và tình huống cạnh tranh version.
- Bổ sung bài kiểm tra PostgreSQL cho hai khách cùng đặt hai ly khi chỉ còn hai
  ly; nếu một đơn không đủ nguyên liệu thì đơn phải rollback toàn bộ.

### Kiểm chứng đã chạy

- Bộ test trọng tâm database, inventory model và ingredient flow: **24/24 đạt**.
- Typecheck API: **đạt**.
- Bộ ba test TV4 dưới `tests/e2e`: lần chạy trước đó **9/9 đạt**.
- Smoke test migration/seed bằng PGlite: xác nhận `products.stock` đã bị bỏ,
  `products.version` còn nguyên, công thức catalog hợp lệ và nguyên liệu được nạp.
- `git diff --check`: đạt.

### Giới hạn chưa kiểm chứng

- Các bài concurrency cần PostgreSQL nhiều kết nối chưa chạy được trong môi
  trường hiện tại vì Docker/PostgreSQL không khả dụng. Chúng vẫn được giữ trong
  `apps/api/test/order-concurrency.test.ts` và cần chạy với `RUN_PG_TESTS=1`
  trên DB test PostgreSQL riêng trước khi xác nhận concurrency thật.
- Lần chạy toàn bộ API suite gần nhất có **11 lỗi ngoài phạm vi thay đổi tồn kho**:
  mock API đang kỳ vọng status 501; test auth gặp lỗi named export `sign` từ
  `jsonwebtoken`; nhóm password-reset gặp `__dirname is not defined`. Hai test
  PostgreSQL bị skip khi không bật cấu hình chạy DB thật. Cần đối chiếu/fix các
  lỗi suite này trong phạm vi thành viên phụ trách trước khi dùng kết quả full
  suite làm tiêu chí release.

## 3. Quy tắc tồn kho sau thay đổi

- Nguồn tồn duy nhất là `ingredients.stock`.
- Lượng nguyên liệu cần dùng được tính từ công thức món/size và topping, nhân
  với số lượng món trong đơn.
- Không thêm lại `products.stock` hoặc fallback dựa trên số lượng sản phẩm.
- `products.version` không được dùng làm khóa tồn kho; optimistic concurrency
  của tồn nguyên liệu dựa trên `ingredients.version`.
- Không chỉnh sửa migration nền đã áp dụng; thay đổi schema hiện hữu phải đi
  qua migration mới và được thêm vào allowlist của migration runner.

## 4. Việc cần phối hợp / bước tiếp theo

1. Khi có PostgreSQL test DB, chạy riêng kiểm thử concurrency với
   `RUN_PG_TESTS=1`; xác nhận một trong hai đơn thành công, đơn còn lại bị từ
   chối/rollback và tồn không âm.
2. Phối hợp TV3/TV6 xử lý các lỗi auth, password-reset và các kiểm thử tích hợp
   ngoài phạm vi inventory nếu cần đưa toàn bộ API suite về xanh.
3. Phối hợp TV1 nếu cần môi trường Docker/local để dựng DB test.
4. Chạy migration trên môi trường tích hợp và xác nhận API/frontend không còn
   phụ thuộc trường stock của product.

## 5. Tóm tắt cho trưởng nhóm

Phần TV4 về loại bỏ tồn kho dư thừa ở product và tính tồn theo công thức nguyên
liệu đã được triển khai, có migration an toàn cho DB hiện hữu và test cục bộ.
`products.version` được giữ; khóa lạc quan đặt ở đúng bản ghi dùng chung là
`ingredients.version`. Test trọng tâm và typecheck API đạt, nhưng chưa thể tuyên
bố concurrency PostgreSQL thật đã được xác nhận do môi trường hiện tại thiếu
Docker/PostgreSQL. Cần chạy hai bài PostgreSQL-only trên DB test trước khi chốt
kiểm chứng concurrency.
