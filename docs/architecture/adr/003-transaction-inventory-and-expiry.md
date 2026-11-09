# ADR 003: Giao dịch tạo đơn, giữ tồn nguyên liệu/sản phẩm và tự động hết hạn

- **Trạng thái:** Đã áp dụng

## Bối cảnh

Khi nhiều khách hàng đặt món cùng lúc hoặc mạng chập chờn, hệ thống không được phép: (1) tin giá từ trình duyệt, (2) bán vượt lượng tồn kho cuối cùng, hoặc (3) giữ kẹt tồn kho vĩnh viễn ở các đơn bỏ dở chưa thanh toán.

## Quyết định

1. **Tính lại giá tại server (`OrdersService`):** Client chỉ gửi `productId`, `size`, `toppingIds`, `quantity` và `promotionCode`. Server tự tra bảng giá, tính tiền dòng và kiểm tra điều kiện mã giảm giá.
2. **Giữ tồn trong cùng một transaction (`DatabaseService.withTransaction`):**
   - Đường chính: tính lượng nguyên liệu theo công thức (`product_recipes`, `topping_recipes`), trừ tồn trên bảng `ingredients` kèm tăng `version`, và lưu chi tiết vào `order_ingredient_reservations`.
   - Đường dự phòng: nếu món chưa khai báo công thức nguyên liệu thì trừ trực tiếp `products.stock` kèm tăng `version`.
   - Nếu bất kỳ nguyên liệu/sản phẩm nào không đủ tồn, toàn bộ transaction tạo đơn `ROLLBACK`.
3. **Hết hạn tự động (`OrderExpiryJob`):** Tiến trình nền trong API quét mỗi 5 giây để chuyển các đơn `PENDING` quá hạn (`ORDER_TTL_MINUTES`, mặc định 15 phút) mà không có giao dịch `PROCESSING` sang `CANCELLED` và hoàn tồn đúng một lần (`stock_released = true`). Mã QR có hạn riêng (`QR_TTL_MINUTES`, mặc định 5 phút) và cho phép cấp lại tối đa 1 lần.

## Phương án thay thế đã cân nhắc

- **Chỉ trừ tồn kho sau khi thanh toán thành công:** Dễ cài đặt khi tạo đơn nhưng dẫn đến rủi ro khách đã trả tiền xong mới phát hiện hết nguyên liệu pha chế.

## Hệ quả

- **Ưu điểm:** Không xảy ra tình trạng thu tiền đơn hết hàng; cờ `stock_released` đảm bảo hủy đơn, thanh toán thất bại hoặc hết hạn chỉ hoàn tồn đúng một lần.
- **Hạn chế:** Tồn kho bị tạm giữ trong thời gian chờ thanh toán, nên bắt buộc phải có `OrderExpiryJob` và ràng buộc `ORDER_TTL_MINUTES >= 2 * QR_TTL_MINUTES` để giải phóng tồn kho kịp thời.
