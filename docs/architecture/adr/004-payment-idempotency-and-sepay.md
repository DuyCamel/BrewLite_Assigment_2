# ADR 004: Kiến trúc thanh toán kép (Mock Ví/Thẻ có Idempotency và Webhook VietQR/SePay)

- **Trạng thái:** Đã áp dụng (API Mock Ví/Thẻ và UI/API VietQR/SePay đã có; UI chọn Ví/Thẻ đang chờ nối)

## Bối cảnh

Đề bài bắt buộc hỗ trợ thanh toán Ví/Thẻ mô phỏng có xử lý idempotency, thất bại và timeout. Đồng thời nhóm phát triển thêm luồng quét mã VietQR và nhận webhook từ SePay để thử nghiệm thanh toán chuyển khoản thực tế.

## Quyết định

1. **Nhánh Mock Ví/Thẻ (`POST /payments`, `PaymentsService`, `MockPaymentGateway`):**
   - Chạy **in-process** bên trong container `api`, không tách container riêng.
   - Bắt buộc header `Idempotency-Key`: cùng key và cùng payload trả lại kết quả cũ; cùng key nhưng khác payload trả `409 Conflict`.
   - Tách 2 bước giao dịch: Transaction 1 ghi bản ghi `payments` ở trạng thái `PROCESSING` trước khi gọi `MockPaymentGateway.charge()`; Transaction 2 chốt `SUCCEEDED` + đơn `PAID` + cộng điểm `loyalty_transactions` (`EARN`, ràng buộc `UNIQUE(order_id)`), hoặc chuyển `FAILED` + `PAYMENT_FAILED` + hoàn tồn. Nếu gateway trả `TIMEOUT`, giữ nguyên `PROCESSING` và tồn kho để đối soát lại bằng cùng key.
2. **Nhánh VietQR/SePay (`POST /webhooks/sepay`, `SepayService`):**
   - Tạo mã thanh toán `DH...` gắn với đơn; trình duyệt hiển thị ảnh QR qua `img.vietqr.io`.
   - Webhook kiểm tra `Authorization: Apikey <SEPAY_WEBHOOK_API_KEY>`, khóa dòng đơn (`FOR UPDATE`), đối chiếu đúng mã `payment_code` hiện hành, số tiền và thời hạn trước khi ghi nhận `PAID` và cộng điểm.

## Phương án thay thế đã cân nhắc

- **Chỉ giữ một luồng thanh toán duy nhất:** Nếu chỉ làm SePay sẽ thiếu yêu cầu bắt buộc về Mock Ví/Thẻ và kiểm thử chủ động các nhánh `FAILED`/`TIMEOUT`/`Idempotency-Key`; nếu chỉ làm Mock thì không thử nghiệm được webhook thực tế.

## Hệ quả

- **Ưu điểm:** Đáp ứng đầy đủ kịch bản kiểm thử idempotency/timeout của đề bài qua API `/payments`, đồng thời có luồng QR chuyển khoản trực quan trên web; cả hai đường đều dùng chung quy tắc chốt đơn `PAID` và tích điểm đúng một lần.
- **Hạn chế:** Giao diện `PaymentView.tsx` hiện mới hiển thị VietQR/SePay; nhóm cần nối thêm nút gọi `POST /payments` trên UI để hoàn thiện trọn vẹn luồng Mock Ví/Thẻ từ màn hình khách hàng.
