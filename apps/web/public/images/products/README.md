# Ảnh sản phẩm và ảnh banner

TV1 phụ trách ảnh sản phẩm và ảnh banner. Đặt ảnh tại đây khi nhóm có ảnh; phối hợp đường dẫn imageUrl với model/DB.

- Ảnh sản phẩm: đặt trực tiếp trong `apps/web/public/images/products/` với tên khớp chính xác `image_url` trong SQL/seed và đúng phần mở rộng thực tế (`.jpg`, `.jpeg`, `.png`, `.webp`).
- Ví dụ sản phẩm có `id` là `ca-phe-sua` thì đặt ảnh tại `apps/web/public/images/products/ca-phe-sua.jpg`.
- Ảnh banner: dùng khung ảnh có sẵn trong phần hero của trang chủ.

Đường dẫn trình duyệt là /images/products/ca-phe-sua.jpg, không phải /public/images/...
Không dùng ảnh trên mạng khi chưa có nguồn do nhóm thống nhất.
