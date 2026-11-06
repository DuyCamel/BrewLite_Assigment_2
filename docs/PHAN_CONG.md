# PHÂN CÔNG MỚI — HOÀN THIỆN BREWLITE ASSIGNMENT 2

> **Đây là file phân công mới dựa trên những gì còn thiếu/chưa được kiểm chứng trong code Assignment 1 và repository Assignment 2, nhằm hoàn thiện đúng đề `Assignment2-BrewLite.pdf`.** Bảng này **thay thế phân công thực hiện cũ** cho giai đoạn hoàn thiện; không yêu cầu viết lại các module đã có. Giữ nguyên người phụ trách chính theo bảng phân công tổng hợp. Những việc đã có code nhưng chưa có minh chứng chạy/test được ghi là **kiểm chứng/bổ sung**, không coi là chưa viết.

## 1. Nguyên tắc chung và thứ tự bắt buộc

- Assignment 2 gồm **Task 1 (Yêu cầu) → Task 2 (Mô hình hóa) → Task 3 (Kiến trúc) → Task 4 (Sprint 1/CI) → Task 5 (Sprint 2/Delivery)**. Đầu ra Task trước phải có trong Git và có lịch sử thay đổi trước khi nghiệm thu Task sau.
- Code hiện ở `apps/web` (Next.js) và `apps/api` (NestJS), không còn ở `frontend`/`backend`. `main_du_phong` là bản dự phòng; phát triển qua nhánh riêng + PR vào `main`.
- Đề bắt buộc mock thanh toán **Ví/Thẻ**; SePay/VietQR có sẵn là tích hợp bổ sung, phải test nhưng không thay thế mock.
- **Trạng thái hiện tại:** Có menu/chi tiết, cart, auth, order, payment, loyalty, theo dõi đơn và nhiều bài test; có CI và Dockerfile. Chưa xác nhận build/Compose sau đổi thư mục; chưa thấy đủ docs Task 1–3, `.env.example`, ma trận truy vết, E2E thực thi, CD/production.
- Mỗi người tự bổ sung test và minh chứng phần mình; người chủ trì E2E/CI/CD tổng hợp, không làm thay toàn bộ logic thành viên khác.

## 2. Bảng phân công tổng hợp MỚI

| TV | Thành viên | Module phụ trách (giữ nguyên) | Việc **còn thiếu / phải hoàn thiện** | Task đề | Đầu ra/tiêu chí bàn giao |
| --- | --- | --- | --- | --- | --- |
| **1** | **Nguyễn Khánh Duy** | Sản phẩm, chi tiết/size/topping, khuyến mãi, giao diện chung, Docker local | Viết lại README (đã giao trong commit tài liệu này); chuẩn hóa hướng dẫn; kiểm chứng GET /products/:id, UI menu/loading/empty/error, size/topping, validate mã; test các trường hợp biên; Docker Compose chạy web+API+DB; phối hợp SePay với TV5 | 4.1, 4.3, 5.1, 5.2 | README đúng cấu trúc; test sản phẩm/khuyến mãi; `docker compose up --build` chạy và health đạt, hướng dẫn local |
| **2** | **Tô Minh Trí** | Giỏ hàng và giao diện checkout | Kiểm thử gộp sản phẩm theo size/topping, quantity 1–99, lưu giỏ/reload/login; xử lý empty/loading/error; chống double-submit; khớp giá chính thức từ API; giỏ chỉ xóa khi PAID; hỗ trợ E2E cart/checkout | 5.1, 5.2 | UI cart/checkout mobile-first hoạt động; test và minh chứng luồng thành công/thất bại |
| **3** | **Võ Hoàng Hiểu Băng** | Đăng ký/đăng nhập, JWT, bảo mật, env, CI | Rà soát auth/guard, quyền truy cập, hết hạn token, email trùng; chuẩn hóa `.env.example` (không secret); chạy `npm ci`/lint/test/build trên cấu trúc mới; CI PR và required checks; minh chứng CI xanh và CI phát hiện lỗi; phối hợp bảo mật production | 4.1, 4.4, 5.1, 5.2, 5.3 | Auth/security test; `.env.example`; PR CI chạy tự động và chặn merge khi lỗi |
| **4** | **Trần Lê Phúc Toàn** | Backend tạo/hủy đơn, giá chốt, tồn kho, migration | Rà soát create/cancel/expire/retry, transaction/rollback, giữ-hoàn tồn đúng một lần, tranh tồn đồng thời; hoàn thiện `previewOrder` nếu nhóm chốt API; integration test tạo đơn/DB; migration/seed tái tạo DB sạch; cùng TV5 kiểm thử retry/payment | 5.1, 5.2 | Test concurrency, rollback, hết hàng, hủy/retry; DB migrate/seed lại được; API không tin giá client |
| **5** | **Nguyễn Thu Thảo** | Payment API/UI, mock Ví/Thẻ, loyalty | Xác nhận mock Ví/Thẻ đáp ứng Task 5.1; test idempotency (cùng key/khác payload/đồng thời), timeout/reconcile/retry, chống trả tiền hai lần; PAID + EARN đúng một lần; kiểm tra webhook/SePay phối hợp TV1; integration test payment | 5.1, 5.2 | Mock payment hoạt động; test thành công/thất bại/timeout/retry, EARN không trùng; contract trạng thái bàn giao TV6 |
| **6** | **Lưu Trọng Thái Anh** | Kết quả thanh toán, lịch sử/chi tiết đơn, trạng thái, CD/production/E2E | Test polling/ownership/clear cart khi PAID; thay `tests/e2e/checkout.spec.todo.ts` bằng E2E thực thi; xây dựng CD image/tag/registry/deploy/migration/health/smoke/rollback; HTTPS production, release/tag, release notes, demo và Sprint Review/Retro; tổng hợp tài liệu bàn giao | 5.1–5.4 | Ít nhất 1 E2E xanh; CD chạy; URL HTTPS web/API/health; rollback, release và minh chứng demo |

**Lưu ý:** Bảng trên là phân công **các đầu việc code/kiểm thử/triển khai còn thiếu**, không phải tuyên bố toàn bộ Task 1–3 đã hoàn tất. Phân công đầu ra tài liệu Task 1–3 và truy vết ở mục 3 bên dưới để không bỏ sót điểm đề.

## 3. Bảng phân công tài liệu bắt buộc Task 1–3 và truy vết

| Task / đầu ra bắt buộc | Chủ trì | Phối hợp | Việc cụ thể / file cần tạo |
| --- | --- | --- | --- |
| **1.1 Context & Scope** | **TV1 — Khánh Duy** | Cả nhóm | `docs/requirements/context-and-scope.md`: bối cảnh, bảng stakeholder/mục tiêu, in-scope/out-of-scope, giả định, ràng buộc, rủi ro |
| **1.2 SRS** | **TV6 — Thái Anh** | TV1–TV5 cung cấp acceptance criteria module | `docs/requirements/srs.md`: FR/NFR đánh mã, MoSCoW, tiêu chí chấp nhận kiểm chứng được, use-case tổng quát |
| **1.3 Use-case trọng tâm** | **TV2 — Minh Trí** | TV4, TV5 | `docs/requirements/use-case-checkout.md`: actor, trigger, pre/postcondition, luồng chính/thay thế/ngoại lệ, use-case diagram và liên kết FR |
| **2.1 Activity diagram** | **TV2 — Minh Trí** | TV3–TV5 | `docs/diagrams/`: nguồn + ảnh xuất; có swimlane, decision, hết hàng, chưa login, thanh toán lỗi |
| **2.2 Sequence diagram** | **TV5 — Thu Thảo** | TV3, TV4 | `docs/diagrams/sequence-checkout.puml` và `.svg` (hoặc tương đương): Customer → Next.js → NestJS → DB → Payment; JWT, transaction, idempotency, alt |
| **2.3 Class diagram** | **TV4 — Phúc Toàn** | TV1, TV5 | `docs/diagrams/`: nguồn + ảnh xuất, User/Product/Order/OrderItem/Payment/Promotion/LoyaltyTransaction, multiplicity, enum |
| **3.1 Kiến trúc + ADR** | **TV3 — Hiểu Băng** | TV1, TV4–TV6 | `docs/architecture/` và `docs/architecture/adr/`: phân lớp, NestJS modules, Next.js, DB/migration, logging, health, config, trade-off, ADR monorepo/payment |
| **3.2 Deployment diagram** | **TV6 — Thái Anh** | TV1 Docker, TV3 secrets/CI | `docs/architecture/` và `docs/deployment.md`: môi trường thực tế, HTTPS, web/API/DB, storage, registry, secrets, health, local/CI/prod |
| **4.1 Backlog/branch/DoD** | **TV3 — Hiểu Băng** | TV6 tổng hợp tiến độ | GitHub Issues/Project: Sprint 1/2, quy ước branch/PR/commit, Definition of Done, link trong README hoặc docs |
| **4.2 Quản lý tài liệu** | **TV6 — Thái Anh** | Cả nhóm | Kiểm tra đủ tài liệu Task 1–3 trong `docs/`; cập nhật qua commit/PR có lý do |
| **8.1 Traceability** | **TV6 — Thái Anh** | Mỗi TV cung cấp FR→code→test phần mình | `docs/traceability-matrix.md`: FR/NFR → UC/US → diagram/design → API/code → test |
| **5.4 Review/Retro** | **TV6 — Thái Anh** | Cả nhóm | Sprint Review, Sprint Retrospective, demo/video, release notes và checklist bàn giao |

**Bảng tài liệu này bổ sung cho bảng tổng hợp, không thay đổi quyền sở hữu module code.** Tài liệu phải khớp với hành vi code hiện có và production được triển khai thực tế; không dựng sơ đồ deployment giả.

## 4. Checklist chi tiết theo từng thành viên

### TV1 — Nguyễn Khánh Duy: Sản phẩm, khuyến mãi, Docker

**Code:** `apps/web/src/views/customer/main/`, `apps/web/src/views/customer/products/`, `apps/web/src/components/products/`, `apps/web/src/components/promotions/`; `apps/api/src/controllers/customer/products.controller.ts`, `apps/api/src/services/products.service.ts`, `apps/api/src/services/promotions.service.ts`, `apps/api/src/models/`; `apps/web/Dockerfile`, `apps/api/Dockerfile`, `docker-compose.yml`, `README.md`.

- [ ] **Task 1.1:** Viết context-and-scope theo bảng tài liệu, có stakeholder và rủi ro.
- [ ] **Task 4.3:** Chạy và test GET /products, GET /products/:id (404, loading/empty/error); menu mobile-first; size/topping, tính giá hiển thị, add-to-cart qua CartStore TV2.
- [ ] **Task 5.1:** Kiểm tra promotion active, thời hạn, minimum, PERCENT/FIXED, giảm tối đa bằng subtotal; không tin tổng tiền từ browser. Phối hợp TV4 nếu cần endpoint preview.
- [ ] **Task 5.2:** Test WELCOME10/HETHAN/CHUADEN/TATMA/MIN100K/GIAMTOIDA/GIAM100 (nếu có trong seed), trường hợp lỗi, DB sample; chạy Compose web+API+DB, health, persistent volume.
- [ ] **Tích hợp:** Kiểm tra QR/SePay với TV5, xác thực webhook/đúng số tiền/chống callback trùng, không dùng tiền thật để demo khi chưa kiểm chứng.
- [x] **README:** Viết lại hướng dẫn Assignment 2 trong commit tài liệu này; **chưa tính đã xác nhận chạy được**.
- **Bàn giao:** link PR, log/test, lệnh Docker chạy được, cổng/env và mô tả image cho TV6.

### TV2 — Tô Minh Trí: Cart và Checkout

**Code:** `apps/web/src/features/cart/cart.store.ts`, `apps/web/src/views/customer/cart/`, `apps/web/src/views/customer/checkout/`, `apps/web/src/app/cart/`, `apps/web/src/app/checkout/`.

- [ ] **Task 1.3, 2.1:** Viết use-case checkout và activity có nhánh lỗi.
- [ ] **Task 5.1:** Test gộp giỏ cùng product/size/topping dù thứ tự topping khác; quantity 1–99, reload, login return URL, xóa sau PAID.
- [ ] **Task 5.1:** Checkout gửi đúng id/size/toppingIds/quantity/promotionCode; không tính giá chính thức ở client; loading/error/empty, chống double-submit.
- [ ] **Task 5.2:** Test giỏ rỗng, mã lỗi, API 401/409, hết hàng, chuyển trang payment; cung cấp kịch bản cho TV6.
- **Bàn giao:** video/ảnh UI mobile, test và PR, contract checkout đã thống nhất TV4/TV5.

### TV3 — Võ Hoàng Hiểu Băng: Auth, CI, môi trường

**Code:** `apps/web/src/views/auth/`, `apps/web/src/features/auth/`, `apps/api/src/controllers/auth/`, `apps/api/src/services/auth.service.ts`, `apps/api/src/config/`, `.github/workflows/ci.yml`.

- [ ] **Task 3.1:** Kiến trúc, ADR, lý do/trade-off; đảm bảo khớp code.
- [ ] **Task 4.1:** Tạo `.env.example` không secret; chuẩn hóa hướng dẫn branch/PR, commit/DoD; mở issue board/backlog với TV6.
- [ ] **Task 4.4:** `npm ci → lint → unit test → build` (có thể thêm typecheck); PR tự chạy, branch protection chặn merge khi lỗi; lưu PR xanh và PR đỏ/log.
- [ ] **Task 5.1–5.2:** Test đăng ký/đăng nhập, email trùng, bcrypt, JWT sai/hết hạn, route cần quyền, chống open redirect; kiểm tra env sau chuyển thư mục.
- [ ] **Task 5.3:** Phối hợp TV6 quản lý CI secrets/permissions; không commit secret.
- **Bàn giao:** `.env.example`, link CI và required checks, auth/security test, tài liệu ADR.

### TV4 — Trần Lê Phúc Toàn: Orders, Inventory, DB

**Code:** `apps/api/src/controllers/customer/orders.controller.ts`, `apps/api/src/services/orders.service.ts`, `apps/api/src/services/inventory.service.ts`, `apps/api/src/models/order.model.ts`, `apps/api/src/models/inventory.model.ts`, `apps/api/database/`, `apps/api/test/`.

- [ ] **Task 2.3:** Class diagram đủ lớp, thuộc tính, quan hệ, multiplicity, trạng thái.
- [ ] **Task 5.1:** Kiểm chứng tạo đơn PENDING + items + giữ tồn cùng transaction; backend tính giá; hủy/hết hạn/hoàn tồn đúng một lần; retry sau FAILED.
- [ ] **Task 5.1:** `previewOrder()` hiện còn `NotImplementedException`; chốt với TV1/TV2 xem có cần endpoint và hoàn thiện nếu sử dụng.
- [ ] **Task 5.2:** Test tranh tồn cuối, rollback, giá client bị sửa, 409, hết hàng, xử lý concurrent requests.
- [ ] **Task 5.2:** Chạy migrate/seed trên DB mới, test dữ liệu và khả năng tái tạo; migration mới thay vì sửa migration đã áp dụng.
- **Bàn giao:** integration test orders/inventory, log migrate/seed, contract trạng thái cho TV5/TV6.

### TV5 — Nguyễn Thu Thảo: Mock Payment, Loyalty, SePay phối hợp

**Code:** `apps/web/src/views/customer/payment/`, `apps/api/src/controllers/customer/payments.controller.ts`, `apps/api/src/services/payments.service.ts`, `apps/api/src/services/loyalty.service.ts`, `apps/api/src/gateways/mock-payment.gateway.ts`, `apps/api/src/models/payment.model.ts`.

- [ ] **Task 2.2:** Sequence diagram có JWT, transaction, idempotency, nhánh thành công/thất bại và kết quả cuối.
- [ ] **Task 5.1:** Đảm bảo luồng mock Ví/Thẻ có thể demo độc lập với SePay, UI/API/validate đúng contract.
- [ ] **Task 5.1–5.2:** Test idempotency (same key/same payload, same key/different payload 409), concurrent requests, timeout/reconcile, retry.
- [ ] **Task 5.2:** PAID + payment SUCCEEDED + loyalty EARN trong transaction, không cộng điểm hai lần; test failure giữ tồn/giỏ phù hợp.
- [ ] **Tích hợp:** Phối hợp TV1 xác nhận SePay webhook, đúng orderId/amount, callback lặp, không lộ key; thống nhất trạng thái cho TV6.
- **Bàn giao:** payment integration tests, log/ảnh mock thành công-thất bại-timeout, contract API.

### TV6 — Lưu Trọng Thái Anh: Tracking, E2E, CD và bàn giao

**Code:** `apps/web/src/views/customer/payment-status/`, `apps/web/src/views/customer/orders/`, `apps/api/src/services/customer-orders.service.ts`, `apps/api/src/services/order-state.service.ts`, `tests/e2e/`, `.github/workflows/`, `scripts/smoke.mjs`.

- [ ] **Task 1.2:** Tổng hợp SRS FR/NFR, MoSCoW, acceptance criteria, use-case tổng quát từ 6 module.
- [ ] **Task 3.2:** Deployment diagram đúng hạ tầng đã chọn, HTTPS, registry, DB private, secrets, health/log.
- [ ] **Task 4.2 & 8.1:** Gom docs Task 1–3; tạo `docs/traceability-matrix.md` với FR/NFR→UC/US→diagram→code→test.
- [ ] **Task 5.1:** Test lịch sử/chi tiết chỉ cho chủ đơn; polling dừng khi kết quả cuối/unmount; không tin trạng thái trên URL; chỉ clear cart khi PAID.
- [ ] **Task 5.2:** Thay `tests/e2e/checkout.spec.todo.ts` bằng ít nhất một E2E chạy được menu→detail→cart→login→checkout→mock payment→PAID→history; thêm failure/timeout khi có thời gian.
- [ ] **Task 5.3:** CD sau CI: tag image theo SHA/version, registry nếu cần, deploy qua CI secrets, migration an toàn, health/smoke, dừng và rollback khi lỗi.
- [ ] **Task 5.4:** URL HTTPS frontend, API/health, DB không public, release/tag + notes, README deploy/rollback (phối hợp TV1), video/demo, Sprint Review/Retro.
- **Bàn giao:** link E2E xanh, CD run, URL production thật, release, demo và checklist nghiệm thu.

## 5. Bàn giao liên module và thứ tự tích hợp

| Đầu vào | Người bàn giao | Người nhận | Điều kiện nhận |
| --- | --- | --- | --- |
| Product/size/topping, PromotionInput, Docker local | TV1 | TV2, TV4, TV6 | API/UI/test + Compose/health chạy |
| CartStore, request checkout | TV2 | TV4, TV5, TV6 | Không tự tin giá; giữ giỏ khi lỗi |
| JWT guard/user context, CI, env | TV3 | TV4, TV5, TV6 | Test bảo mật + CI PR |
| Orders/inventory/transaction/retry | TV4 | TV2, TV5, TV6 | Trạng thái và rollback nhất quán |
| Payment result/loyalty/idempotency | TV5 | TV6 | Mock chạy, trạng thái có thẩm quyền |
| E2E/CD/production, traceability | TV6 | Cả nhóm | URL/test/release và minh chứng |

## 6. Definition of Done và bằng chứng bắt buộc

Một đầu việc chỉ được đánh dấu **Hoàn thành** khi:
1. Có code/tài liệu đúng vị trí, liên kết issue và PR/commit, được review.
2. Có acceptance criteria; unit/integration/component/E2E phù hợp chạy thành công.
3. `npm ci`, lint, test, build/CI không lỗi; không merge nếu required check fail.
4. Cập nhật docs và ma trận truy vết tương ứng; sơ đồ có file nguồn và ảnh/PDF xuất.
5. Với Docker/CD/production: có log, health, URL thật, secrets an toàn, cách rollback.
6. Không tự nhận phần đang TODO hoặc chưa chạy thực tế là đã xong.

**Đặc biệt:** Nếu chưa có tài liệu bắt buộc Task trước thì Task sau không đạt phần truy vết; nếu URL production không hoạt động khi chấm thì phần triển khai Task 5 chưa hoàn thành.

## 7. Checklist tiến độ chung (mặc định chưa xác nhận)

- [ ] Task 1: Context/scope + SRS + use-case.
- [ ] Task 2: Activity + sequence + class (nguồn + export).
- [ ] Task 3: Kiến trúc/ADR + deployment diagram thực tế.
- [ ] Task 4: `.env.example`, issue board, PR/DoD, menu MVP, CI và required checks.
- [ ] Task 5: Full flow, mock Ví/Thẻ, integration/E2E, Docker Compose, CD, production HTTPS.
- [ ] Traceability matrix và minh chứng.
- [ ] Release/tag, release notes, README deploy/rollback, demo, Sprint Review/Retrospective.

**Tài liệu tham chiếu:** `Assignment2-BrewLite.pdf`; code `main` và README của repository. Khi công việc hoàn thành, cập nhật checklist bằng PR có link minh chứng, không tự suy diễn trạng thái.
