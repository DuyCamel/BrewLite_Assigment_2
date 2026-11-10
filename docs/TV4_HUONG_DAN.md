# TV4 — Hướng dẫn trạng thái dự án và bàn giao cho trưởng nhóm

## 1. Phạm vi chính của TV4

TV4 phụ trách phần backend liên quan đến:
- Đơn hàng
- Tồn kho / recipe validation
- Transaction / rollback
- Payment finalization
- Data migration / DB consistency
- Kiểm chứng concurrency và logic hủy đơn theo thời gian hết hạn

Nói ngắn gọn, TV4 chịu trách nhiệm cho phần "cốt lõi backend của order lifecycle" trong hệ thống BrewLite.

## 2. Trạng thái hiện tại

### 2.1. Đã hoàn thành và kiểm chứng

TV4 đã hoàn thành phần cốt lõi về logic backend, bao gồm:

- rà soát và sửa lỗi dữ liệu DB fixture / migration đang không khớp với file SQL hiện tại trong repo
- cập nhật lại các test để chạy theo cấu trúc DB thực tế hiện có
- thêm regression test cho các trường hợp quan trọng:
  - mixed valid/invalid recipe order flow
  - order isolation khi finalize payment
  - rollback và integrity khi order không hợp lệ
- kiểm tra logic hủy đơn quá hạn và payment finalization trên PostgreSQL thật, không chỉ mock/PGlite
- đảm bảo logic không tự động cancel các đơn PENDING khác của cùng user khi chỉ có một order được thanh toán thành công
- bổ sung validation cho inventory/recipe để tránh order partially valid

### 2.2. Mức độ hoàn thành theo scope TV4

- TV4 core backend: khoảng 90–95%
- Chưa hoàn toàn có thể gọi là 100% vì phần hệ thống end-to-end còn phụ thuộc vào các TV khác và môi trường tích hợp

## 3. Những phần còn lại không hoàn toàn thuộc TV4

Các phần còn lại chủ yếu là phụ thuộc vào nhóm khác, chứ không hoàn toàn nằm trong ràng buộc của TV4:

- TV1: Docker / local environment / cấu hình chạy project
- TV3: .env / JWT / auth / security / CI
- TV6: frontend polling, cancel flow, tracking order UI, E2E validation

Tức là:
- logic backend TV4 đã ổn
- nhưng repo toàn bộ chưa thể được xem là "xanh hoàn toàn end-to-end" nếu chưa có tích hợp từ môi trường, auth và UI của các TV còn lại

## 4. Kết luận quan trọng cho trưởng nhóm

TV4 đã hoàn thành phần backend cốt lõi và đã có bằng chứng kiểm thử thực tế trên PostgreSQL.

Những điểm cần lưu ý:
- đây là công việc thuộc backend order / inventory / payment / DB, không phải toàn bộ dự án
- các issue còn lại phía ngoài TV4 chủ yếu là vấn đề môi trường, auth, UI và E2E
- phần phụ thuộc này không làm giảm giá trị của phần TV4 đã làm, mà chỉ cho thấy việc tích hợp toàn hệ thống cần phối hợp đồng bộ với các TV khác

## 5. Cách đánh giá nhanh

- Nếu hỏi: "TV4 backend logic đã xong chưa?" → Đã xong phần cốt lõi.
- Nếu hỏi: "Dự án tổng thể đã hoàn tất chưa?" → Chưa hoàn toàn, vì còn phần phụ thuộc vào TV1/TV3/TV6.
- Nếu hỏi: "Đã fix order expiry và payment isolation chưa?" → Đã kiểm tra và xác nhận logic đúng trên môi trường DB thật.

## 6. Ghi chú giao ban / bàn giao

TV4 cần giữ vai trò chủ trì backend order lifecycle và chuẩn hóa các rule nghiệp vụ liên quan đến thanh toán và hủy đơn. Các TV khác nên tiếp tục phụ trách:
- môi trường chạy local + Docker
- auth/JWT/.env/CI
- frontend polling và E2E

Sau khi các phần này được đồng bộ, hệ thống sẽ đạt trạng thái ổn định toàn đường dữ liệu từ checkout → payment → order tracking → cancel/expire.
