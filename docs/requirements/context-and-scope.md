# Task 1.1 - Bối cảnh, stakeholder và phạm vi

> Tóm tắt từ `docs/File_Bao_Cao_Tong_Hop.docx`. Câu hỏi khảo sát và cách thu thập dưới đây là kế hoạch; chưa có số liệu phỏng vấn hay kết quả đo thực tế.

## Bối cảnh và vấn đề

BrewLite giúp khách chọn đồ uống, size/topping, xem giá, đặt và thanh toán không tiền mặt, rồi theo dõi mã và trạng thái đơn để nhận tại quầy. Mục tiêu là giảm thời gian chờ, sai sót tính tiền và nhầm đơn. Hệ thống cần tính giá ở backend, giữ tồn cùng transaction khi tạo đơn, chỉ cho khách xem đơn của mình và chống ghi nhận thanh toán lặp.

Nhóm dự kiến đối chiếu đặc tả sản phẩm, phỏng vấn bán cấu trúc và quan sát quy trình tại quầy. Các tình huống cần xác minh trước khi chốt thiết kế:

| Mã | Câu hỏi cần khảo sát | Yêu cầu được làm rõ |
| --- | --- | --- |
| KS01 | Khách chờ gọi món và thanh toán bao lâu vào giờ cao điểm? | Menu và đặt đơn trên web |
| KS02 | Khách có phải hỏi lại giá khi đổi size/thêm topping? | Giá và tổng giỏ minh bạch |
| KS03 | Pager/gọi tên có gây thất lạc hay nhầm đơn? | Mã và trạng thái đơn trực tuyến |
| KS04 | Có trường hợp thu tiền rồi mới phát hiện hết hàng? | Giữ tồn và rollback khi tạo đơn |
| KS05 | Khi mạng lỗi và khách thử thanh toán lại, quán đối soát thế nào? | Idempotency và trạng thái chưa rõ |
| KS06 | Tiền mặt có làm chậm phục vụ? | Mock Ví/Thẻ không tiền mặt trong MVP |
| KS07 | Nhân viên xác định thứ tự pha chế và bàn giao ra sao? | Máy trạng thái đơn hàng |
| KS08 | Tích điểm thủ công có chậm hoặc dễ gian lận? | Cộng điểm một lần sau `PAID` |

## Stakeholder

| Bên liên quan | Vấn đề/mối quan tâm | Mục tiêu/kỳ vọng | Thu thập dự kiến |
| --- | --- | --- | --- |
| Khách hàng | Xếp hàng, khó xem giá tùy chọn, nhầm khi nhận đơn | Đặt nhanh, biết tổng tiền và tiến độ đơn | Phỏng vấn ngắn, phiếu hỏi |
| Nhân viên quầy | Đơn đông dễ lộn xộn, tính nhẩm sai | Nhận và cập nhật đơn theo thứ tự rõ ràng | Phỏng vấn, quan sát |
| Quản lý cửa hàng | Đối soát tiền, bán vượt tồn, gian lận điểm | Đơn/tiền/tồn/điểm nhất quán | Phỏng vấn theo tình huống |
| Giảng viên/người nghiệm thu | Chất lượng nghiệp vụ và kỹ thuật | Có yêu cầu, test và minh chứng triển khai đối chiếu được | Đối chiếu đề và tiêu chí chấm |
| Nhóm phát triển | Tích hợp, xử lý đồng thời và thanh toán | Kiến trúc kiểm thử, tái tạo và triển khai được | Sprint Planning, trao đổi nhóm |
| Đơn vị thanh toán mô phỏng | Retry, mạng chập chờn và giao dịch lặp | Không ghi nhận thanh toán hai lần | Đọc đặc tả mock gateway |

## Phạm vi

| Nhóm | Nội dung |
| --- | --- |
| Trong MVP | Menu/chi tiết/size/topping, giỏ, đăng ký/đăng nhập JWT, tạo và xem đơn, mock Ví/Thẻ, hủy/thử lại, tồn kho, khuyến mãi, cộng điểm |
| Mô phỏng phục vụ nghiệm thu | Thao tác nhân viên tối giản để chuyển `PAID → PREPARING → READY → COMPLETED`; giao diện quầy đầy đủ là phần mở rộng |
| Ngoài phạm vi | Giao hàng, nhiều chi nhánh, cổng thu tiền thật trong MVP, hoàn tiền tự động, kế toán, quản lý ca và giao diện quản trị nguyên liệu thô |
| Công nghệ/ràng buộc | Next.js, NestJS, PostgreSQL; Docker Compose cho môi trường local; dữ liệu nhạy cảm không đưa vào repo |

Ứng dụng giả định một cửa hàng, khách nhận đồ tại quầy, tiền VNĐ, tối đa một mã giảm giá cho mỗi đơn; một dòng giỏ gồm sản phẩm, size và tập topping. Việc tích hợp SePay để thử chuyển khoản là phần bổ sung, không thay thế mock Ví/Thẻ bắt buộc.

## Rủi ro và mục tiêu nghiệm thu

| Rủi ro | Hướng xử lý cần kiểm chứng |
| --- | --- |
| Retry hoặc timeout gây thanh toán trùng | Idempotency-Key và đối soát kết quả chưa rõ |
| Nhiều khách giữ cùng phần tồn cuối | Transaction và kiểm tra tồn đồng thời; lỗi phải rollback |
| Chuyển nhầm bước pha chế | Chỉ chấp nhận cạnh trạng thái hợp lệ và quyền nhân viên |
| Web/API/DB lệch cấu hình khi demo | Compose local, migration/seed và kiểm tra tích hợp sớm |

Đích nghiệm thu: demo menu → giỏ → đăng nhập → đặt → mock thanh toán → xác nhận; test thanh toán lặp, tranh tồn và cộng điểm một lần; test JWT/quyền sở hữu; thành viên khác chạy lại từ README/Compose; có URL HTTPS, health và phương án rollback. Đây là **mục tiêu**, không phải tuyên bố hệ thống đã đạt.
