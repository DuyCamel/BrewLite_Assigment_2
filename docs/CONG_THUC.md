# Công thức định lượng đồ uống

Đây là quy ước tồn kho nguyên liệu dùng chung của nhóm. Dữ liệu chạy thật nằm trong
[006_recipe_catalog.sql](../backend/database/006_recipe_catalog.sql); không sửa trực tiếp
`001_schema.sql` hoặc `005_ingredient_inventory.sql`.

## Quy tắc size

- Định lượng trong catalog là cho size `S`.
- Size `M` = định lượng `S` x 125%, làm tròn lên từng nguyên liệu.
- Size `L` = định lượng `S` x 150%, làm tròn lên từng nguyên liệu.
- Topping Trân châu tiêu hao 50 gram/phần.
- Topping Kem sữa tiêu hao 30 gram/phần.

Ví dụ Cà phê sữa:

| Nguyên liệu |   S |   M |   L | Đơn vị |
| ----------- | --: | --: | --: | ------ |
| Cà phê phin |  60 |  75 |  90 | ml     |
| Sữa đặc     |  25 |  32 |  38 | ml     |
| Đá          | 150 | 188 | 225 | gram   |

## Tồn đầu kỳ

Mỗi nguyên liệu được khởi tạo 5.000 theo đơn vị của nguyên liệu:

- Chất lỏng: `5.000 ml`
- Bột/chất rắn: `5.000 gram`
- Đơn vị đếm: `5.000 piece`

Khi tạo đơn, backend lấy `product_id`, `size`, `topping_ids` và `quantity`, sau đó
nhân định lượng công thức với số lượng ly. Nguyên liệu được giữ trong cùng transaction
với đơn hàng. Hủy đơn hoặc thanh toán thất bại sẽ hoàn đúng lượng đã giữ.

## Danh sách sản phẩm

Định lượng chi tiết của 36 sản phẩm theo bảng nhóm cung cấp được khai báo trong migration
`006_recipe_catalog.sql`, với cùng mã sản phẩm trong `backend/database/seed/products.json`.
Không dùng `products.stock` làm tồn chính sau khi migration 006 đã chạy; nguồn tồn chính
là `ingredients.stock`, còn `products.stock` chỉ phục vụ tương thích dữ liệu cũ.
