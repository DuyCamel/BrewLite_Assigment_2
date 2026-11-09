# Task 1.2 - SRS rút gọn

> Yêu cầu và tiêu chí chấp nhận rút từ `docs/File_Bao_Cao_Tong_Hop.docx`; đây là cơ sở viết test, không phải kết quả kiểm thử. Must = bắt buộc; Should = nên có.

## Yêu cầu chức năng

| Mã | Phân hệ/yêu cầu | Ưu tiên | Tiêu chí chấp nhận |
| --- | --- | --- | --- |
| FR-01 | Menu | Must | `GET /products` hiển thị tên, ảnh, giá; có loading, empty, error. |
| FR-02 | Chi tiết và tùy chọn | Must | Chỉ chọn size/topping được phép; đổi tùy chọn cập nhật giá hiển thị. |
| FR-03 | Quản lý giỏ | Must | Số lượng nguyên 1-99; cùng sản phẩm/size/tập topping thì gộp dòng; xóa hết báo giỏ rỗng. |
| FR-04 | Tổng tiền | Must | Tổng dòng trừ ưu đãi hợp lệ; backend tính lại, không tin giá client. |
| FR-05 | Đăng ký | Must | Email hợp lệ và duy nhất; lưu hash mật khẩu; không trả hash về client. |
| FR-06 | Đăng nhập/phân quyền | Must | Đúng thông tin cấp JWT; API bảo vệ chặn token thiếu/hết hạn; khách không được cập nhật pha chế. |
| FR-07 | Tạo đơn | Must | Giỏ hợp lệ/còn hàng tạo một đơn `PENDING`, lưu giá chốt, trả mã đơn. |
| FR-08 | Giữ tồn | Must | Hai yêu cầu tranh phần tồn cuối không cùng thành công; tồn không âm; lỗi tạo đơn rollback tồn. |
| FR-09 | Mock Ví/Thẻ | Must | Thành công → `PAID`; thất bại xác định → `PAYMENT_FAILED`; timeout → đang xử lý, chưa kết luận thất bại. |
| FR-10 | Idempotency | Must | Cùng key/payload trả cùng kết quả; cùng key khác payload trả 409; không thu/cộng điểm lần hai. |
| FR-11 | Xác nhận/lịch sử | Must | Khách xem mã, món, tổng, trạng thái đơn của mình; không đọc được đơn người khác. |
| FR-12 | Máy trạng thái | Must | Chỉ cạnh hợp lệ; API kiểm tra quyền nhân viên; đơn chưa `PAID` không được pha chế. |
| FR-13 | Khuyến mãi | Must | Kiểm tra active, hạn và mức tối thiểu; giảm không vượt tiền hàng, lưu giảm giá khi tạo đơn. |
| FR-14 | Điểm thưởng | Must | Chỉ cộng sau `PAID`; mỗi đơn tối đa một `EARN`; callback lặp không cộng thêm. |
| FR-15 | Thử lại/hủy | Must | `PAYMENT_FAILED` chỉ thử lại sau kiểm tra/giữ tồn mới; không hủy khi thanh toán đang xử lý hoặc đã thành công. |
| FR-16 | Giao diện quầy | Should | Nhân viên xem đơn đã trả tiền và thao tác bước tiếp theo. |

## Yêu cầu phi chức năng

| Mã | Yêu cầu | Tiêu chí kiểm chứng dự kiến |
| --- | --- | --- |
| NFR-01 | Hiệu năng | Mục tiêu API dưới 500 ms; đề xuất đo p95 với 1.000 sản phẩm, 20 người dùng trong 5 phút và lưu kết quả. |
| NFR-02 | Bảo mật tài khoản | Bcrypt, mật khẩu đề xuất tối thiểu 8 ký tự, JWT đề xuất 15 phút; không ghi token/mật khẩu vào log. |
| NFR-03 | Quyền và riêng tư | Khách chỉ đọc đơn mình; chỉ STAFF cập nhật pha chế; sai quyền trả 401/403 (hoặc 404 khi che tồn tại đơn). |
| NFR-04 | Nhất quán dữ liệu | Đơn và tồn cùng transaction; key thanh toán và `EARN` theo đơn duy nhất; tiền nguyên VNĐ. |
| NFR-05 | Khả dụng giao diện | Mobile-first, kiểm tra 360 px và desktop; loading/empty/error, nhãn và bàn phím. |
| NFR-06 | Khả năng tái tạo | `.env.example`, migration, seed, Compose và README; đổi môi trường không sửa mã. |
| NFR-07 | Vận hành | `/health` hoạt động; log có requestId/orderId; frontend HTTPS, DB production không public. |
| NFR-08 | Chất lượng/CI | PR chạy lint, test, build và chặn merge khi lỗi; có integration tạo đơn/thanh toán và một E2E chính. |
| NFR-09 | Triển khai/khôi phục | Image gắn SHA/version, secret ngoài repo, smoke sau deploy và rollback về image trước với migration tương thích. |

Số liệu tải, thời hạn JWT và mật khẩu là **đề xuất cần xác nhận**, chưa phải kết quả đo hay toàn bộ yêu cầu nguyên văn của đề.

## Tác nhân và sơ đồ tổng quát

Khách hàng xem menu/giỏ và sau khi đăng nhập thì đặt, thanh toán, xem đơn; nhân viên quầy xử lý đơn đã trả tiền; mock payment gateway trả kết quả thanh toán. Quản lý, giảng viên và nhóm phát triển là stakeholder, không phải actor thao tác trong phạm vi MVP. Database và UI là thành phần hệ thống, không phải actor.

**Còn thiếu:** bản Word có mục "Sơ đồ use-case tổng quát" nhưng bản text trích xuất không có hình hoặc nguồn sơ đồ. Nhóm cần đưa **nguồn và bản xuất** vào `docs/diagrams/`, rồi liên kết từ đây; chưa đánh dấu yêu cầu sơ đồ là hoàn tất.
