# Phạm vi bộ khung BrewLite

Yêu cầu hiện tại: trang chính cơ bản có sản phẩm đầy đủ, chưa có ảnh thì để khung trống.
Các trang đăng nhập, đăng ký, chi tiết sản phẩm, giỏ, checkout, thanh toán, kiểm tra thanh toán và lịch sử chỉ tạo file khung.
Frontend Next.js và backend NestJS tách riêng; PostgreSQL cho dữ liệu.
Học cách chia controller/model/view của PTTKHTTT_canhan, không sao chép Express/EJS hoặc trang admin/nhân viên.
Mỗi file chưa làm có thành viên phụ trách, tên method, TODO mô tả nhiệm vụ và trang/API liên quan.
Có .env_vidu và hướng dẫn copy thành .env; không commit mật khẩu thật.
Có Markdown phân công 6 người. Chưa triển khai nghiệp vụ ngoài trang chính; stub phải thể hiện rõ chưa hoàn thành.

Yêu cầu cập nhật: backend tách routes/controllers/services/models giống cách tổ chức PTTKHTTT. URL tập trung ở routes; logic ở services; SQL ở models. Không dùng thư mục modules gộp nhiều tầng.

Yêu cầu database bổ sung: 001 schema chung, 002 logic/ràng buộc tại DB, 003 dữ liệu demo đủ test. SQL này không thay việc hoàn thiện service/API còn TODO.

Phân công cập nhật: TV1 sản phẩm + khuyến mãi + Docker local; TV2 giỏ + UI checkout; TV3 Auth + bảo mật + CI; TV4 backend đơn + tồn; TV5 payment + loyalty; TV6 tracking + CD + ghép E2E. Đồng bộ TODO theo PHAN_CONG.md, không coi thay chủ nhiệm là đã triển khai tính năng.
