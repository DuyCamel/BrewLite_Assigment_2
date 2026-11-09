# Triển khai production, bàn giao và rollback (TV6)

Nền tảng thực tế: **một VPS Linux chạy Docker Compose**, HTTPS bằng **Caddy**, image lưu ở **GitHub Container Registry (GHCR)**, CI/CD bằng **GitHub Actions**.
Sơ đồ: [`diagrams/deployment.svg`](diagrams/deployment.svg) (nguồn `diagrams/deployment.dot`, ảnh `diagrams/deployment.png`).

> Trạng thái thật: các file CD, compose production và `deploy.sh` đã được viết và kiểm tra cú pháp (YAML, `sh -n`), **chưa chạy trên VPS thật** vì chưa có máy chủ và secret. Chỉ được ghi "đã deploy" vào báo cáo sau khi `scripts/smoke.mjs` đạt trên URL HTTPS thật.

## 1. Truy vết thành phần trong sơ đồ

| Thành phần trong sơ đồ            | Mô tả kiến trúc / mã nguồn                                                                  |
| --------------------------------- | ------------------------------------------------------------------------------------------- |
| Trình duyệt / PWA                 | `apps/web/` (Next.js), giỏ và phiên đăng nhập ở localStorage                                 |
| caddy (80, 443)                   | `docker-compose.prod.yml`, `deploy/Caddyfile`                                                |
| brewlite-web (3000, nội bộ)       | `apps/web/Dockerfile`                                                                        |
| brewlite-api (4000, nội bộ)       | `apps/api/Dockerfile`, `GET /health` ở `apps/api/src/controllers/system/health.controller.ts` |
| postgres + volume `brewlite_data` | `docker-compose.prod.yml`; schema/migration ở `apps/api/database/`                           |
| brewlite-migrate (job)            | stage `builder` của `apps/api/Dockerfile`, lệnh `npm run db:migrate -w apps/api`             |
| GitHub Actions + GHCR             | `.github/workflows/ci.yml` (TV3), `cd.yml`, `rollback.yml` (TV6)                             |
| Smoke test                        | `scripts/smoke.mjs`                                                                          |
| Deploy/rollback trên VPS          | `deploy/deploy.sh`                                                                           |
| Local                             | `docker-compose.yml` (TV1), chỉ bind `127.0.0.1`                                             |

Ranh giới: **Local** (máy dev, secret mẫu từ `.env.example`) → **CI** (runner GitHub, chạy test và build image, secret chỉ có trong GitHub Secrets) → **Production** (VPS, secret ở `.env.prod` trên máy chủ). Chỉ Caddy mở cổng ra internet; db, api, web không publish cổng.

## 2. Chuẩn bị một lần

**VPS** (Ubuntu, Docker Engine + plugin Compose):

1. Trỏ DNS bản ghi A của `WEB_DOMAIN` và `API_DOMAIN` về IP VPS (có thể dùng tên miền miễn phí như DuckDNS).
2. Firewall chỉ mở 22, 80, 443: `ufw allow 22,80,443/tcp && ufw enable`. **Không mở 5432.**
3. Tạo thư mục triển khai (ví dụ `/opt/brewlite`) và file `.env.prod` theo mẫu `deploy/env.prod.example`. Quyền `chmod 600 .env.prod`. Không commit file này.
4. Tạo cặp khóa SSH riêng cho CD, đưa public key vào `~/.ssh/authorized_keys` của user deploy (user thuộc nhóm `docker`).

**GitHub** (Settings → Secrets and variables → Actions; tạo thêm Environment `production`). Secret và Variable đặt ở **cấp repository** (tab *Repository secrets* / *Repository variables*) để mọi job của CD đều đọc được. Cần quyền admin trên repo (repo hiện nằm ở tài khoản `DuyCamel`, nên Duy hoặc người được cấp quyền admin thao tác):

| Loại     | Tên                  | Giá trị                                                    |
| -------- | -------------------- | ---------------------------------------------------------- |
| Secret   | `DEPLOY_HOST`        | IP hoặc tên miền VPS                                       |
| Secret   | `DEPLOY_USER`        | user SSH                                                   |
| Secret   | `DEPLOY_SSH_KEY`     | private key dành riêng cho CD                              |
| Secret   | `DEPLOY_KNOWN_HOSTS` | kết quả `ssh-keyscan -H <host>` (ghim khóa máy chủ)        |
| Secret   | `DEPLOY_PATH`        | thư mục trên VPS, ví dụ `/opt/brewlite`                    |
| Secret   | `SMOKE_EMAIL`, `SMOKE_PASSWORD` | tài khoản thử riêng (tùy chọn)                  |
| Variable | `PUBLIC_API_URL`     | `https://<API_DOMAIN>`                                     |
| Variable | `PUBLIC_WEB_URL`     | `https://<WEB_DOMAIN>`                                     |
| Variable (tùy chọn) | `NEXT_PUBLIC_VIETQR_BANK_ID`, `NEXT_PUBLIC_VIETQR_ACCOUNT_NO`, `NEXT_PUBLIC_VIETQR_ACCOUNT_NAME` | tài khoản nhận tiền để trang thanh toán hiện mã QR; thiếu thì không có QR |

Workflow CD dùng `GITHUB_TOKEN` để đẩy image lên GHCR (job `images` có `packages: write`) và truyền token qua stdin để VPS `docker login` khi pull (job `deploy`/`rollback` có `packages: read`). `IMAGE_OWNER` trong `.env.prod` phải là tên chủ repo **viết thường**, ví dụ `duycamel`. Không có secret nào nằm trong repo hay in ra log.

## 3. Điểm phối hợp với TV1 và TV3

1. **`apps/web/Dockerfile` (TV1):** `NEXT_PUBLIC_API_BASE_URL` được nhúng vào bundle lúc build. Nếu Dockerfile không khai báo `ARG`, image production sẽ gọi nhầm `http://localhost:4000`. Gói sửa lỗi này đã thêm hai dòng sau `FROM dependencies AS builder` (mặc định giữ nguyên hành vi `docker compose` local):
   ```dockerfile
   ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
   ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
   ```
   Đây là file của TV1, cần báo TV1 biết khi merge.
2. **Biến `NEXT_PUBLIC_*` không được chứa secret** vì bị nhúng vào trình duyệt. `.env.example` hiện chỉ có các biến an toàn (URL API, thông tin tài khoản nhận tiền VietQR).
3. **Thư mục `apps/api/sepay/`** (ở ngoài `src/`) chứa các file stub trùng tên với `apps/api/src/sepay/` và không được import; code thật là bản trong `src/`. Nên nhờ TV1 xóa để tránh nhầm khi truy vết.
4. **Tài khoản demo:** `002_seed.sql` tạo 24 khách mẫu (`khachNN@brewlite.test`) cùng mật khẩu `BrewLite123!` và nhiều đơn mẫu. Seed là bắt buộc cho lần deploy đầu (có menu để smoke test), nhưng trên production cần đổi mật khẩu hoặc vô hiệu các tài khoản này. Chưa kiểm chứng cách xóa an toàn vì có ràng buộc trigger với đơn và điểm thưởng. Khi quay video demo nên đăng ký tài khoản mới.

## 4. Deploy

Tự động: push vào `main` hoặc tạo tag `vX.Y.Z` → `cd.yml` chạy:

1. **quality**: `npm ci` → typecheck → lint → test → build (cùng bước với `ci.yml`).
2. **images**: build và push `brewlite-api`, `brewlite-web`, `brewlite-migrate` lên GHCR với tag `sha-<7 ký tự>` (và semver khi là tag `v*`).
3. **deploy**: gửi `docker-compose.prod.yml`, `Caddyfile`, `deploy.sh` lên VPS rồi chạy `deploy.sh deploy <tag>`: pull image → `pg_dump` sao lưu (`backups/`) → migrate → đổi api/web → chờ `/health`. Health lỗi thì tự quay về bản trước.
4. **smoke**: `scripts/smoke.mjs` trên URL HTTPS thật (`/health` phải `database: "up"`).
5. **rollback**: nếu smoke lỗi, quay về bản trước, smoke lại, mở issue cảnh báo và đánh dấu pipeline thất bại.

**Lần deploy đầu tiên** (DB trống): `deploy.sh` tự phát hiện bảng `products` trống sau khi migrate, chạy `db:seed` rồi migrate lại (để áp dụng các migration catalog cần dữ liệu seed). Các lần deploy sau không seed lại. Nếu cần làm tay:

```sh
cd /opt/brewlite
export IMAGE_TAG=$(cat .state/current_tag)
docker compose --env-file .env.prod -f docker-compose.prod.yml --profile tools run --rm migrate npm run db:seed -w apps/api
docker compose --env-file .env.prod -f docker-compose.prod.yml --profile tools run --rm migrate
```

Migration phải **chỉ thêm** (bảng/cột mới, không xóa thứ bản cũ đang dùng) để rollback code vẫn chạy được với DB mới; schema đã áp dụng không sửa đè (`001`, `002`), dùng file mới từ `010_...sql` trở đi (và thêm tên file vào danh sách trong `apps/api/scripts/database.ts`, vì runner chỉ áp dụng các file có trong danh sách đó).

## 5. Rollback

- **Tự động:** xem mục 4 (health lỗi trên VPS hoặc smoke lỗi trên URL thật).
- **Thủ công:** GitHub → Actions → **Rollback** → Run workflow, nhập tag (ví dụ `sha-1a2b3c4` hoặc `1.0.0`); bỏ trống để quay về bản trước (`.state/previous_tag`). Hoặc trên VPS: `sh deploy.sh rollback <tag>`.
- **Chỉ đổi code (image), không hoàn tác DB.** Nếu một migration làm hỏng dữ liệu, khôi phục từ bản sao lưu trước deploy đó:
  ```sh
  gunzip -c backups/pre-<tag>.sql.gz | docker compose --env-file .env.prod -f docker-compose.prod.yml exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
  ```
  (cần dừng api/web trước và tạo lại database trống; nên thử trên bản sao trước.)

## 6. Release v1.0.0

Sau khi smoke đạt trên production:

```sh
git checkout main && git pull
git tag -a v1.0.0 -m "BrewLite v1.0.0"
git push origin v1.0.0
```

Tag kích hoạt `cd.yml` (image gắn thêm tag `1.0.0`). Trên GitHub → Releases → Draft a new release → chọn tag `v1.0.0` → dán nội dung `docs/RELEASE_NOTES_v1.0.0.md` (điền URL và ngày thật trước khi dán): tính năng (menu, giỏ, đăng nhập JWT, đặt đơn, thanh toán Ví/Thẻ mô phỏng và chuyển khoản SePay, lịch sử/trạng thái đơn), cách chạy local bằng Docker, URL production, các giới hạn đã biết.

## 7. Checklist nghiệm thu (người ngoài nhóm tự kiểm tra)

- [ ] `https://<WEB_DOMAIN>` mở được, chứng chỉ HTTPS hợp lệ.
- [ ] `https://<API_DOMAIN>/health` trả `{"status":"ok","dataSource":"postgres","database":"up"}`.
- [ ] Từ máy ngoài, `nc -zv <IP VPS> 5432` **không** kết nối được (DB không public).
- [ ] `node scripts/smoke.mjs` với `SMOKE_API_URL`, `SMOKE_WEB_URL` đạt toàn bộ bước.
- [ ] Repository và log CI không chứa `JWT_SECRET`, mật khẩu DB, khóa SePay hay khóa SSH.
- [ ] Có tag `v1.0.0`, release notes và `README.md` hướng dẫn chạy local, test, build, deploy, rollback.
- [ ] Video/demo luồng menu → giỏ → đăng nhập → đặt đơn → thanh toán → PAID trên URL production.

## 8. Chạy local và E2E bằng Docker

```sh
cp .env.example .env           # Windows: copy .env.example .env
# Mở .env, đặt JWT_SECRET (>= 32 ký tự, không chứa local_only/replace_) và SEPAY_WEBHOOK_API_KEY riêng.
docker compose up -d --wait db
npm ci && npm run db:migrate && npm run db:seed && npm run db:migrate
docker compose up -d --build
npm i -D @playwright/test && npx playwright install chromium
SEPAY_WEBHOOK_API_KEY=<giá trị trong .env> npx playwright test
```

`docker-compose.yml` đã truyền `SEPAY_WEBHOOK_API_KEY` cho `api` nên `docker-compose.e2e.yml` chỉ còn là lớp dự phòng (workflow `e2e.yml` vẫn dùng, vô hại).

**Bắt buộc trước khi chạy workflow E2E trên GitHub:** chạy `npm i -D @playwright/test` ở gốc repo rồi commit **cả** `package.json` và `package-lock.json` cùng lúc; nếu thiếu, `npm ci` hoặc `npx playwright` trong workflow sẽ lỗi. CI thường (`ci.yml`) không bị ảnh hưởng vì `typecheck` chỉ quét hai workspace và ESLint không phân giải import.
