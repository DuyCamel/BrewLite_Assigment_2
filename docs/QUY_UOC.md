# Quy ước code

- Next.js app/ chỉ định tuyến; views/ là giao diện, features/ chứa logic phía client; không viết SQL ở frontend.
- NestJS controller nhận request, service xử lý nghiệp vụ, model mới truy cập SQL. SQL luôn tham số hóa.
- Giữ Next.js/NestJS/PostgreSQL; chỉ khách hàng có giao diện. Không thêm trang admin/nhân viên.
- TODO phải ghi TV, method, route/trang, điều kiện nghiệp vụ; stub backend trả 501 và không sửa dữ liệu.
- Giá và ảnh seed tại backend; không để menu frontend hardcode thành nguồn giá chính thức.
- Các file chưa triển khai được phép có signature và throw 501; không coi stub là tính năng hoàn tất.
- Khi implement protected API phải thêm JWT và kiểm tra chủ đơn trước khi bỏ 501.
- Mỗi người tự viết test module, mở PR; thay đổi contracts/schema dùng chung cần thống nhất nhóm.
- Không commit .env, node_modules, dist, .next hoặc thông tin đăng nhập thật.

Contract Product hiện có ở backend/src/types/product.types.ts và frontend/src/types/product.ts. TV1 cập nhật đồng thời cả hai khi thay đổi response; nếu mở rộng nhiều, nhóm thống nhất package contract dùng chung.

- routes/ chỉ định nghĩa URL; controllers/ dùng route constants và gọi services/; SQL nghiệp vụ chỉ trong models/. config/db.ts chỉ cung cấp kết nối và ping health.
