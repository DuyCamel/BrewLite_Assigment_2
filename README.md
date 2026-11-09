# BrewLite — Assignment 2: Requirements to Deployment

> Đồ án Công nghệ phần mềm, Trường Đại học Sài Gòn, học kỳ I năm học 2026–2027. Phát triển tiếp BrewLite từ Assignment 1. **Trạng thái: đang hoàn thiện Assignment 2, chưa xác nhận đạt nghiệm thu production.**

## 1. Mục tiêu và phạm vi

BrewLite hỗ trợ khách hàng đặt đồ uống và thanh toán không dùng tiền mặt. Luồng nghiệp vụ tối thiểu theo Assignment 2:

**Xem menu → Chọn size/topping → Giỏ hàng → Đặt đơn → Thanh toán → Theo dõi đơn.**

- **Frontend:** Next.js (hướng mobile-first/PWA).
- **Backend:** NestJS, API và xử lý nghiệp vụ.
- **Database:** PostgreSQL, migration và seed.
- **Thanh toán:** Ví/Thẻ mô phỏng là luồng bắt buộc của đề; repository cũng có mã VietQR/SePay phục vụ thử nghiệm, không thay thế yêu cầu mock payment.
- **Hạ tầng:** Docker Compose local; CI trên GitHub Actions; CD và production HTTPS là mục tiêu phải hoàn thiện.
- **Phạm vi MVP:** giao diện khách hàng; không mặc định có trang quản trị/nhân viên.

## 2. Trạng thái hiện tại

| Hạng mục | Trạng thái dựa trên repository |
| --- | --- |
| Chuyển cấu trúc sang `apps/web`, `apps/api` | Đã commit trên `main` |
| Menu, API sản phẩm, chi tiết, tùy chọn, giỏ, đăng nhập, đặt đơn, theo dõi | Đã có code; cần chạy lại và kiểm thử theo yêu cầu Assignment 2 |
| Khuyến mãi, mock payment, loyalty, VietQR/SePay | Đã có code liên quan; cần xác nhận tích hợp, trường hợp lỗi và test |
| Dockerfile web/API và Compose DB/web/API | Có cấu hình; **chưa có minh chứng chạy thành công sau chuyển thư mục** |
| CI | Có `.github/workflows/ci.yml`; cần minh chứng PR CI xanh/đỏ và required checks |
| Tài liệu Task 1–3 theo cấu trúc đề | Đã có trong `docs/requirements/`, `docs/diagrams/`, `docs/architecture/`, `docs/deployment.md` |
| `.env.example`, issue board/backlog, traceability matrix | Đã có `.env.example` và `docs/traceability-matrix.md`; cần bổ sung/kiểm chứng issue board/backlog |
| E2E thực thi, CD, production HTTPS, release, rollback | Chưa có minh chứng hoàn thành |

**Quy tắc:** Có file hoặc code không đồng nghĩa đã đạt tiêu chí nghiệm thu. Các trạng thái trên không thay cho kết quả chạy test hoặc deployment.

## 3. Cấu trúc repository

```text
brewlite/
├── apps/
│   ├── web/                    # Next.js mobile-first/PWA
│   └── api/                    # NestJS
├── docs/
│   ├── requirements/           # Task 1
│   ├── diagrams/               # Task 2
│   ├── architecture/           # Task 3
│   ├── traceability-matrix.md
│   └── deployment.md
├── tests/                      # Integration/E2E
├── .github/workflows/          # CI/CD
├── docker-compose.yml
├── .env.example
└── README.md
```

Thư mục bắt buộc theo đề: `apps/web`, `apps/api`, `docs`. Những đường dẫn `frontend/`, `backend/` trong tài liệu cũ là đường dẫn của Assignment 1, không còn là vị trí code hiện tại.

## 4. Yêu cầu môi trường

- Node.js **22+**, npm.
- PostgreSQL hoặc Docker Desktop có Docker Compose.
- Git; trình duyệt để thử ứng dụng.
- Không commit `.env`, mật khẩu, JWT secret, SePay key hay thông tin ngân hàng nhạy cảm.

### Thiết lập local

```bash
git clone https://github.com/DuyCamel/BrewLite_Assigment_2.git
cd BrewLite_Assigment_2
```

Dùng `main` để lấy cấu trúc Assignment 2; `main_du_phong` là nhánh dự phòng code cũ.

Tạo file môi trường tại **gốc repo**:

```powershell
# Windows PowerShell
Copy-Item .env.example .env
```

```bash
# macOS/Linux
cp .env.example .env
```

Chỉnh `.env` theo database local, `JWT_SECRET` an toàn và các cấu hình thực sự sử dụng; tuyệt đối không đưa secret thật lên Git.

### Chạy PostgreSQL + ứng dụng bằng npm

```bash
docker compose up -d db
npm ci
npm run db:check
npm run db:migrate
npm run db:seed
npm run db:migrate
npm run dev
```

Nếu đã có PostgreSQL, có thể bỏ lệnh Docker DB và cấu hình DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME phù hợp. Thứ tự migrate → seed → migrate lần nữa được giữ từ dự án hiện tại để áp dụng các migration cần dữ liệu seed.

- Web: http://localhost:3000
- API: http://localhost:4000
- Health: http://localhost:4000/health
- Sản phẩm: http://localhost:4000/products

Các lệnh trên là **hướng dẫn cần kiểm chứng trên bản main mới**, không phải khẳng định đã chạy thành công.

### Docker Compose toàn bộ

```bash
docker compose config --services
docker compose up --build
```

Compose được cấu hình cho `db`, `api`, `web`. Phải kiểm tra health, kết nối giữa container, migration/seed, cổng và dữ liệu bền vững. Nếu Docker chưa chạy được, ghi lỗi vào issue và không đánh dấu Task 5.2 hoàn thành.

### Mở lại Docker sau khi bật máy (Windows PowerShell)

Mở Docker Desktop và chờ Docker Engine chạy. Tại thư mục gốc repo, dùng **cùng một cửa sổ PowerShell** cho các lệnh Compose sau. Máy đang chạy PostgreSQL local ở cổng `5432` nên cổng DB Docker trên máy là `5433`; bên trong container DB vẫn dùng `5432`.

```powershell
$env:DB_PORT="5433"
docker compose up -d
docker compose ps
```

Chờ `db` và `api` hiện `healthy`, rồi mở http://localhost:3000. Có thể kiểm tra API ở http://localhost:4000/health và thực đơn ở http://localhost:4000/products. **Không chạy lại `db:seed` mỗi lần khởi động**: dữ liệu DB Docker được giữ trong volume. Nếu sửa code hoặc cấu hình VietQR dùng lúc build web, chạy `docker compose up --build -d`; nếu chỉ sửa thời gian đơn/QR hoặc khóa webhook trong `.env`, chạy `docker compose up -d --no-deps api`.

Muốn thử webhook SePay, mở **PowerShell thứ hai** và giữ lệnh sau chạy trong khi thử thanh toán:

```powershell
cloudflared tunnel --url http://localhost:4000
```

Quick Tunnel có thể đổi URL sau mỗi lần chạy. Cập nhật SePay webhook thành `https://<URL-moi>.trycloudflare.com/webhooks/sepay`; không đưa khóa webhook lên web hoặc vào URL. Khi dùng xong, dừng tunnel bằng `Ctrl+C`, rồi dừng container bằng `docker compose down` trong cửa sổ PowerShell đầu tiên. **Không dùng `docker compose down -v`** vì `-v` xóa volume chứa DB Docker.

## 5. Kiểm tra chất lượng và build

Chạy tại gốc repository:

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
```

Chạy từng workspace nếu cần:

```bash
npm run dev -w apps/api
npm run dev -w apps/web
```

CI theo **Task 4.4** phải tự chạy khi mở Pull Request: **Install → Lint → Unit Test → Build**. Bắt buộc bật branch protection/required checks để không merge khi lint, test hoặc build lỗi. Cần lưu link PR, một log chạy thành công và một log phát hiện lỗi.

## 6. Yêu cầu Assignment 2 và đầu ra cần bàn giao

Assignment 2 có **5 Task tuần tự**, task sau chỉ được nghiệm thu khi đầu ra bắt buộc của task trước đã có trong repository và có lịch sử thay đổi.

| Task | Đầu ra bắt buộc / tiêu chí kiểm tra |
| --- | --- |
| **1 — Yêu cầu** | `docs/requirements/context-and-scope.md` (stakeholder, phạm vi, giả định/rủi ro); SRS có FR/NFR, MoSCoW, acceptance criteria, use-case tổng quát; đặc tả use-case Đặt và thanh toán |
| **2 — Mô hình hóa** | Activity diagram có nhánh hết hàng/chưa login/thất bại; sequence có JWT, transaction, payment, idempotency; class diagram có User, Product, Order, OrderItem, Payment, Promotion, LoyaltyTransaction; lưu **nguồn và file kết xuất** |
| **3 — Kiến trúc** | Mô tả Next.js/NestJS/PostgreSQL, migration, logging/health/config, trade-off; ADR trong `docs/architecture/adr/`; deployment diagram khớp môi trường production thực tế |
| **4 — Sprint 1** | Repo `apps/web`, `apps/api`, `docs`; README, `.gitignore`, `.env.example`; branch/PR, issue board/Product Backlog, commit convention, DoD; tài liệu Task 1–3; GET /products, GET /products/:id, menu mobile-first/loading/empty/error, seed, test; CI và required checks |
| **5 — Sprint 2/Delivery** | Luồng MVP đầy đủ, mock Ví/Thẻ, validate; unit/integration/**ít nhất một E2E**; migration/seed tái tạo DB; Docker Compose web/API/DB; health; pipeline CD; production HTTPS, release/tag, rollback, demo, Sprint Review/Retrospective |

### Truy vết bắt buộc

Nhóm phải tạo `docs/traceability-matrix.md` nối **FR/NFR → use-case/user story → sơ đồ/thiết kế → code/API → test**. Không chỉ liệt kê yêu cầu mà phải trỏ đến đầu ra thật. Nếu thiếu tài liệu Task trước, phần truy vết của Task sau không được tính.

### CI/CD và production — tiêu chí chưa được xác nhận

Pipeline cuối cùng theo Task 5.3:

```text
Push/Tag → Lint/Test → Build → Docker image (SHA/version)
         → Push registry (nếu cần) → Deploy bằng CI secrets
         → Migration an toàn → Health/Smoke → Rollback khi lỗi
```

Bàn giao Task 5.4 phải có URL web **HTTPS**, URL API và `/health`, PostgreSQL production không public trực tiếp, secrets không nằm trong Git/log, release/tag và release notes, hướng dẫn local/test/build/deploy/rollback, video/demo, Sprint Review và Sprint Retrospective.

**Chưa có URL production được xác nhận**: không điền URL giả và không tuyên bố hoàn thành deployment.

## 7. Quy trình làm việc nhóm

- `main`: nhánh tích hợp Assignment 2; `main_du_phong`: nhánh dự phòng Assignment 1.
- Mỗi thành viên làm việc trên nhánh riêng, mở PR vào `main`, ghi issue/Task/FR liên quan và đính kèm minh chứng.
- Commit nên mô tả đúng thay đổi; thay đổi yêu cầu/sơ đồ/kiến trúc cần ghi lý do.
- **Definition of Done:** đúng yêu cầu và acceptance criteria; có test phù hợp; lint/test/build qua; cập nhật tài liệu/truy vết; PR được review và CI đạt.
- Không sửa migration đã áp dụng trực tiếp; tạo migration mới. Không đưa secrets hoặc dữ liệu thanh toán thật vào repo.
- Xem **[Bảng phân công mới — công việc còn thiếu](docs/PHAN_CONG.md)** để biết người phụ trách, file liên quan và điều kiện bàn giao.

## 8. Tài liệu nhóm hiện có

- **Task 1 — Yêu cầu:** [context-and-scope.md](docs/requirements/context-and-scope.md), [srs.md](docs/requirements/srs.md), [use-case-checkout.md](docs/requirements/use-case-checkout.md)
- **Task 2 — Mô hình hóa:** [docs/diagrams/task2.md](docs/diagrams/task2.md) ([activity-checkout.svg](docs/diagrams/activity-checkout.svg), [sequence-checkout.svg](docs/diagrams/sequence-checkout.svg), [class-domain.svg](docs/diagrams/class-domain.svg))
- **Task 3 — Kiến trúc & Triển khai:** [docs/architecture/README.md](docs/architecture/README.md), [docs/architecture/adr/](docs/architecture/adr/), [docs/deployment.md](docs/deployment.md) ([deployment.svg](docs/diagrams/deployment.svg))
- **Truy vết:** [docs/traceability-matrix.md](docs/traceability-matrix.md)
- **Nội bộ nhóm:** [Phân công mới](docs/PHAN_CONG.md), [Công thức](docs/CONG_THUC.md), [Hướng dẫn database](apps/api/database/README.md)

## 9. Checklist trước nghiệm thu

- [ ] Task 1: Context/scope, SRS, use-case, acceptance criteria.
- [ ] Task 2: Activity, sequence, class; nguồn + kết xuất.
- [ ] Task 3: Architecture, ADR, deployment diagram thực tế.
- [ ] Task 4: Repo, `.env.example`, backlog/board, DoD, MVP menu, CI PR và required checks.
- [ ] Task 5: Luồng end-to-end, mock payment, unit/integration/E2E, Docker Compose, CD, production HTTPS, rollback.
- [ ] `docs/traceability-matrix.md` khớp code và test.
- [ ] Release/tag, release notes, URL web/API/health, demo, Sprint Review/Retrospective.
- [ ] Người ngoài nhóm clone, cài và chạy được theo README.

> Tài liệu này mô tả mục tiêu và trạng thái repository tại thời điểm cập nhật; những mục chưa kiểm chứng phải được đánh dấu hoàn thành bằng bằng chứng, không bằng suy đoán.
