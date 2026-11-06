# Phân công lập trình BrewLite cho 6 thành viên

Phân công hiện hành đã cân lại: TV1 nhận khuyến mãi và Docker local; TV2 nhận giao diện checkout; TV3 nhận CI; TV4 chỉ làm backend đơn/tồn; TV5 thanh toán/điểm; TV6 theo dõi đơn và CD/production. Nhóm điền họ tên vào bảng khi nhận việc.

## Hiện trạng để không làm lại

Đã có menu/tìm kiếm/lọc, API danh sách sản phẩm, khung ảnh và cách gắn imageUrl. Database 001/002/003 đã có schema, kiểm tra và dữ liệu mẫu; runner migrate/seed, 16 test, health và CI typecheck/test/build đã có. Đây không phải công việc cần viết lại từ đầu.

Auth, Cart, Checkout và lịch sử/chi tiết đơn đã có luồng chính; Payment vẫn là khung TODO. PromotionInput đã được gắn vào Checkout nhưng backend mới xác nhận mã khi tạo đơn. Docker hiện chỉ chạy DB; Docker web/API, lint/required checks, CD và E2E nghiệp vụ cần hoàn thiện. Không có trang Admin/nhân viên.

Các đường dẫn frontend rút gọn `views/`, `features/`, `components/`, `app/` tính từ `frontend/src/`; backend rút gọn `services/`, `models/`, `controllers/`, `routes/`, `config/` tính từ `backend/src/`. Các file Docker, README và workflows dùng đường dẫn từ gốc repo.

## Bảng giao việc

| TV  | Họ và tên | Phần phụ trách chính                      | Việc phụ gắn cùng module                                    |
| --- | --------- | ----------------------------------------- | ----------------------------------------------------------- |
| 1   | Nguyễn Khánh Duy | Sản phẩm, chi tiết/tùy chọn và khuyến mãi | Giao diện chung, ảnh, Docker/Compose chạy local             |
| 2   | Tô Minh Trí | Giỏ hàng và giao diện checkout            | Lưu giỏ, gắn PromotionInput của TV1, nối API TV4            |
| 3   | Võ Hoàng Hiểu Băng   | Đăng ký/đăng nhập, JWT và bảo mật         | Env/API client/error dùng chung, CI và required checks      |
| 4   | Trần Lê Phúc Toàn  | Backend tạo/hủy đơn và tồn kho            | Giá chốt, transaction, hết hạn, hoàn/giữ tồn lại            |
| 5   | Nguyễn Thu Thảo  | Giao diện/API thanh toán và loyalty       | Mock gateway, idempotency, timeout/đối soát                 |
| 6   | Lưu Trọng Thái Anh | Kết quả thanh toán, lịch sử/chi tiết đơn  | Quy tắc trạng thái, CD/production, ghép E2E/README bàn giao |

## Thành viên 1 Sản phẩm khuyến mãi và Docker local

**Giao diện:** frontend/src/views/customer/main/HomeView.tsx; views/customer/products/ProductDetailView.tsx; views/layouts/CustomerLayout.tsx; components/products/ProductCard.tsx; components/promotions/PromotionInput.tsx; public/images/.

**Backend:** backend/src/controllers/customer/products.controller.ts; services/products.service.ts; models/product.model.ts; services/promotions.service.ts; models/promotion.model.ts. Route sản phẩm trong routes/customer.routes.ts.

**Môi trường local:** frontend/Dockerfile.todo; backend/Dockerfile.todo; docker-compose.yml; hướng dẫn chạy local trong README. Đổi tên .todo thành Dockerfile khi thực sự triển khai.

- Hoàn thiện getProductDetail/findById; loadProduct, selectSize, toggleTopping, calculateDisplayPrice và addToCart qua CartStore TV2. Không viết giỏ riêng.
- Hoàn thiện validatePromotion/findByCode/calculateDiscount: active, thời hạn, minimum_amount, PERCENT/FIXED; giảm không vượt subtotal. Chuẩn hóa code và làm tròn tiền thống nhất với TV4.
- PromotionInput kiểm tra mã qua `POST /promotions/validate` trước khi hiển thị đã áp dụng; endpoint chỉ trả tổng xem trước từ subtotal gửi lên. TV4 vẫn tính lại giá, điều kiện mã và mức giảm từ DB trong `POST /orders`; không tin tổng từ preview và không gọi service NestJS trực tiếp từ browser.
- Docker phải chạy được web + API + DB, volume DB bền vững, host/API URL đúng môi trường; phối hợp env với TV3 và bàn giao image/cổng/health cho TV6.
- Test menu đủ/rỗng/lỗi, chi tiết 404, size/topping, các mã WELCOME10/HETHAN/CHUADEN/TATMA/MIN100K/GIAMTOIDA/GIAM100 và clone chạy Docker local.

## Thành viên 2 Giỏ hàng và giao diện checkout

**File chính:** frontend/src/features/cart/cart.store.ts; views/customer/cart/CartView.tsx; views/customer/checkout/CheckoutView.tsx; app/cart/page.tsx; app/checkout/page.tsx. Phối hợp layout badge với TV1.

- addItem/updateQuantity/removeItem/calculateSubtotal/restoreCart/clearAfterPayment: quantity nguyên 1–99, gộp key productId + size + tập topping đã sắp xếp; giữ giỏ khi tải lại/đăng nhập.
- CheckoutView: loadCheckout/submitOrder, xem lại món và tổng tạm, loading/lỗi, chống gửi đồng thời trên UI; gửi id/size/toppingIds/quantity/promotionCode tới POST /orders của TV4.
- Gắn PromotionInput của TV1, không viết lại công thức khuyến mãi. Hiển thị tổng chính thức/orderId backend trả rồi chuyển sang /payment của TV5.
- Chưa login thì dùng luồng TV3, giữ giỏ và returnUrl. Giỏ chỉ xóa sau API xác nhận PAID qua trang kết quả TV6.
- Không viết SQL, transaction tạo đơn hoặc giữ/hoàn tồn. Các việc đó thuộc TV4.
- Test topping khác thứ tự vẫn gộp, số lượng biên, giỏ rỗng, reload, login quay lại, mã lỗi và hết hàng từ API.

## Thành viên 3 Tài khoản bảo mật và CI

**Frontend:** frontend/src/views/auth/; features/auth/auth.service.ts; lib/api.ts; app/login và app/register.

**Backend:** controllers/auth/auth.controller.ts; routes/auth.routes.ts; services/auth.service.ts; services/users.service.ts; models/user.model.ts; config/environment.ts; config/db.ts; types/contracts.ts (file chung).

**CI:** .github/workflows/ci.yml và thiết lập required checks/branch protection với chủ repo. Không phụ trách CD/hosting của TV6.

- register/login/logout/verifyAccessToken/handleSessionExpired; email unique, bcrypt hash, JWT, 401 khi token thiếu/sai/hết hạn, không nhận role/userId tin cậy từ client.
- Cung cấp guard và cách lấy user hiện tại cho TV4/TV5/TV6. Không trả/log hash, mật khẩu hoặc token.
- Quay lại URL nội bộ sau login, không mất giỏ, không open redirect. Thống nhất cách lưu/gửi phiên với cả nhóm trước khi code.
- Hoàn thiện CI npm ci → lint/typecheck → test → build; required checks thực sự cần thiết lập ở GitHub, không chỉ viết YAML.
- Phối hợp TV1 về .env trong Docker và TV6 về secrets production; không commit .env. Không đổi transaction helper mà chưa báo TV4/TV5.
- Test email trùng/khác hoa thường, sai mật khẩu, JWT hết hạn, truy cập API bảo vệ; minh chứng CI qua và CI phát hiện lỗi.

## Thành viên 4 Backend đơn hàng và tồn kho

**File chính:** backend/src/controllers/customer/orders.controller.ts; services/orders.service.ts; services/inventory.service.ts; models/order.model.ts; models/inventory.model.ts; routes/customer.routes.ts (phần orders).

- previewOrder/createOrder nhận dữ liệu từ UI checkout TV2; backend tính lại giá và gọi PromotionsService TV1; trả orderId/status/subtotal/discount/total chính thức.
- Tạo đơn PENDING + chi tiết + giữ tồn trong cùng PoolClient/transaction. 002 chỉ cho lập chi tiết trong transaction tạo đơn; không tạo order xong commit rồi mới thêm item.
- reserveStock/decreaseStock phải gộp lượng theo productId, kiểm tra stock/version, số dòng cập nhật; rollback toàn bộ khi lỗi/tranh tồn.
- cancelOrder/expirePendingOrders/releaseStock/restoreStockOnce hoàn tồn đúng một lần; không hủy khi Payment PROCESSING hoặc thành công.
- preparePaymentRetry giữ tồn mới trước khi đưa PAYMENT_FAILED về PENDING; phối hợp TV5, không tự gọi gateway hoặc tự cộng điểm.
- Không làm CheckoutView (thuộc TV2). previewOrder mới có service khung, chưa có endpoint preview riêng; thống nhất contract với TV1/TV2 nếu thêm.
- Test giá client bị sửa, hai người tranh tồn cuối, rollback, hủy/hết hạn, dấu hoàn tồn và retry hết hàng.

## Thành viên 5 Thanh toán và điểm thưởng

**Frontend:** frontend/src/views/customer/payment/PaymentView.tsx và app/payment/page.tsx.

**Backend:** controllers/customer/payments.controller.ts; services/payments.service.ts; services/loyalty.service.ts; models/payment.model.ts; models/loyalty.model.ts; gateways/mock-payment.gateway.ts; routes/customer.routes.ts (payments).

- selectMethod/submitPayment/retryPayment và createPayment/getPaymentStatus/reconcilePayment/finalizePayment; kiểm tra JWT TV3, chủ đơn và trạng thái.
- Cùng key/payload trả cùng kết quả; key khác payload trả 409; chỉ đổi key khi là lần thử mới sau thất bại xác định. Một đơn không có hai attempt PROCESSING/SUCCEEDED.
- Không giữ transaction PostgreSQL mở khi chờ gateway. Timeout giữ PROCESSING/PENDING và tồn; đối soát cùng key, không tự chuyển FAILED.
- Chốt Payment SUCCEEDED + Order PAID + INSERT EARN trong một transaction ngắn. Trigger tự cộng users.loyalty_points; tuyệt đối không cộng tay lần hai.
- Thất bại xác định/thử lại gọi hàm tồn của TV4; giao orderId/paymentId và kết quả có thẩm quyền cho trang TV6. Không tự xóa giỏ khi chưa PAID.
- Test key trùng, payload đổi, 2 request đồng thời, thất bại rồi retry, timeout sau gateway đã thành công và EARN chỉ một lần.

## Thành viên 6 Theo dõi đơn và triển khai

**Frontend:** frontend/src/views/customer/payment-status/PaymentStatusView.tsx; views/customer/orders/OrderHistoryView.tsx; OrderDetailView.tsx; các route app tương ứng.

**Backend:** controllers/customer/customer-orders.controller.ts; services/customer-orders.service.ts; models/customer-order.model.ts; services/order-state.service.ts; controllers/system/health.controller.ts; routes/system.routes.ts.

**Delivery:** tests/e2e/checkout.spec.todo.ts; workflow CD cần bổ sung sau khi chốt hosting; tài liệu deploy/smoke/rollback và README bàn giao. CI thuộc TV3, Docker local thuộc TV1.

- getMyOrders/getOrderDetail lấy userId từ JWT TV3, chặn đọc đơn người khác; UI loading/rỗng/lỗi và mã đơn/trạng thái.
- checkPaymentStatus/pollPaymentStatus/stopPolling gọi API TV5; không tin status trên URL. Dừng polling khi có kết quả/unmount; chỉ gọi CartStore.clearAfterPayment TV2 khi backend xác nhận PAID.
- Nút hủy gọi API TV4, xử lý 409 và tải lại trạng thái; không tự hoàn tồn. Retry chuyển sang luồng TV5.
- assertTransition/transitionOrder dùng quy tắc DB 002 và OrderModel TV4; phối hợp file chung, không tạo trang nhân viên.
- Dùng image/config TV1 và CI TV3 để ghép CD/HTTPS/secret/health/smoke/rollback, cung cấp URL production.
- Chủ trì E2E toàn luồng; mỗi TV tự viết test và sửa lỗi phần mình. Test quyền sở hữu, chuyển trạng thái sai, polling và smoke sau deploy.

## Các giao điểm bắt buộc

| Bàn giao                                    | Người cung cấp | Người sử dụng |
| ------------------------------------------- | -------------- | ------------- |
| Sản phẩm/tùy chọn và PromotionInput         | TV1            | TV2           |
| PromotionsService và cách tính giảm         | TV1            | TV4           |
| CartStore và dữ liệu checkout               | TV2            | TV1, TV5, TV6 |
| UI checkout + request tạo đơn               | TV2            | API TV4       |
| JWT/guard/user hiện tại, CI                 | TV3            | TV4, TV5, TV6 |
| Đơn đã chốt, giữ/hoàn tồn, retry            | TV4            | TV2, TV5, TV6 |
| Trạng thái thanh toán và kết quả chính thức | TV5            | TV6           |
| Docker local/image/cổng/env                 | TV1            | TV3, TV6      |
| Workflow CI và required checks              | TV3            | TV6 ghép CD   |

## Quy định hoàn thành

Mỗi người tự viết test, xử lý lỗi và ghi hướng dẫn phần mình; mở PR từ nhánh tv1-products-promotions, tv2-cart-checkout, tv3-auth-ci, tv4-orders-inventory, tv5-payments-loyalty, tv6-tracking-delivery. Đây là tên gợi ý, chưa tạo sẵn nhánh.

Không sửa đè 001/002 đã được áp dụng: dùng migration mới từ 004_...sql và thống nhất nhóm. Schema dùng chung không thuộc độc quyền TV1 hoặc một người. Chỉ bỏ 501 khi Auth/quyền sở hữu/validate và nghiệp vụ tương ứng hoàn chỉnh. Không nhận phần đã có là đã hoàn thành toàn module.
