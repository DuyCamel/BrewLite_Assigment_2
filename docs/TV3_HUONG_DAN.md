# TV3: Tài khoản, bảo mật và CI (hướng dẫn và đối chiếu PHAN_CONG.md)

Nhánh PR gợi ý: `tv3-auth-ci`. Đường dẫn tính từ gốc repo.

## 1. Đối chiếu với mục "Thành viên 3" của PHAN_CONG.md

| Yêu cầu                                                                                   | Trạng thái                                                          | Ở đâu / ghi chú                                                                                    |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| register, login, logout, verifyAccessToken, handleSessionExpired                          | Xong                                                                | `backend/src/services/auth.service.ts`, `frontend/src/features/auth/auth.service.ts`               |
| Email unique (kể cả khác hoa thường), bcrypt, JWT                                         | Xong                                                                | email chuẩn hóa chữ thường; unique index `lower(email)` của DB là nguồn sự thật, trùng trả 409     |
| 401 khi token thiếu/sai/hết hạn, kiểm tra ở API chứ không chỉ UI                          | Xong                                                                | `JwtAuthGuard`; mã `TOKEN_MISSING` / `TOKEN_INVALID` / `TOKEN_EXPIRED`                             |
| Không nhận role/userId tin cậy từ client                                                  | Xong                                                                | register chỉ đọc `email`, `password`; `userId` chỉ lấy từ JWT                                      |
| Guard và cách lấy user hiện tại cho TV4/TV5/TV6                                           | Xong                                                                | `backend/src/guards/` (mục 4)                                                                      |
| Không trả/log hash, mật khẩu, token                                                       | Xong                                                                | `passwordHash` chỉ có ở `UserRecord` nội bộ; log chỉ có thông điệp lỗi hạ tầng                     |
| Quay lại URL nội bộ, không mất giỏ, không open redirect                                   | Xong                                                                | `frontend/src/features/auth/return-url.ts`; không đụng key localStorage của giỏ                    |
| npm ci, typecheck, lint, test, build trong CI                                             | Viết xong, **chưa chạy trên GitHub**                                | `.github/workflows/ci.yml`, `eslint.config.mjs`, script `lint` ở `package.json` gốc                |
| Test email trùng/khác hoa thường, sai mật khẩu, JWT hết hạn, API bảo vệ                   | **Xong và đã chạy thật:** 84/84 test qua (bản merge, thư viện thật) | `backend/test/auth.test.ts`, `auth.db.test.ts`, `orders-auth.test.ts`, `menu.test.ts`              |
| Gắn `JwtAuthGuard` cho API đơn của khách (TODO TV3 trong `customer-orders.controller.ts`) | **Xong**                                                            | `GET /orders/me` và `GET /orders/:id` giờ cần JWT; `orders-auth.test.ts` kiểm tra đi qua HTTP thật |
| Nối `getAccessToken()` trong `frontend/src/lib/client-api.ts` (TODO TV3)                  | **Xong**                                                            | trang "Đơn của tôi" gửi token; 401 từ server thì xóa phiên                                         |
| **Thống nhất cách lưu/gửi phiên với cả nhóm trước khi code**                              | **Chưa làm**                                                        | Tôi đã chọn JWT trong `localStorage`, gửi bằng `Authorization: Bearer`. Cần nhóm đồng ý (mục 8)    |
| **Required checks / branch protection trên GitHub**                                       | **Chưa làm, cần làm cùng chủ repo**                                 | Mục 7                                                                                              |
| **Minh chứng CI qua và CI phát hiện lỗi**                                                 | **Chưa làm**                                                        | Mục 7                                                                                              |
| Phối hợp TV1 (.env trong Docker) và TV6 (secrets production)                              | Cần nhắn                                                            | Mục 5 và 10                                                                                        |
| Không đổi transaction helper                                                              | Giữ nguyên                                                          | `config/db.ts` không bị sửa                                                                        |

## 2. File dùng chung đã sửa (báo nhóm trước khi merge)

Đợt merge đầu: `backend/src/app.module.ts` (thêm provider), `backend/src/main.ts` (CORS nhiều origin, dừng sớm khi thiếu hoặc sai `JWT_SECRET`), `backend/src/config/environment.ts` (cấu hình JWT), `frontend/src/views/layouts/CustomerLayout.tsx` (nút "Đăng nhập" thành `<AccountNav />`), `.github/workflows/ci.yml`, `package.json` gốc, `.env_vidu`, `README.md`, `backend/database/README.md`, `docs/VI_TRI_CODE.md`.

Đợt sửa sau merge (file của người khác, chỉ sửa đúng phần TODO giao cho TV3):

- `backend/src/controllers/customer/customer-orders.controller.ts` (TV6): thêm `@UseGuards(JwtAuthGuard)` cho cả class. Trước đó không ai gắn guard nên `/orders/me` luôn trả 401 dù đã đăng nhập.
- `frontend/src/lib/client-api.ts` (TV6): `getAccessToken()` đọc token từ phiên đăng nhập (trước đó luôn `return null`), và xóa phiên khi server trả 401.
- `.env_vidu`: sau merge có hai dòng `JWT_SECRET` (một dòng mẫu cũ `replace_with_a_random_secret` do commit khác thêm vào, 28 ký tự và chứa `replace_` nên backend sẽ từ chối). Đã gộp thành một khối.
- `backend/test/menu.test.ts`: bỏ `/products/abc` khỏi danh sách "khung 501" vì TV1 đã làm xong chi tiết món (trả 404), test đó đang đỏ trên `main`.

Đợt thêm tính năng quên mật khẩu (mục 11): thêm migration `backend/database/008_password_reset.sql` (schema dùng chung, cần nhóm đồng ý), thêm 2 provider vào `backend/src/app.module.ts`, thêm cảnh báo cấu hình vào `backend/src/main.ts`, thêm biến môi trường vào `.env_vidu`, và thêm link "Quên mật khẩu?" vào `LoginView.tsx`.

## 3. Đã làm gì

**Backend**: `models/user.model.ts`, `models/db-errors.ts`, `services/{auth,users,auth-validation}.ts`, `guards/{jwt-auth.guard,current-user.decorator}.ts`, `controllers/auth/auth.controller.ts` (`register` 201, `login` 200, `me` cần JWT), `routes/auth.routes.ts` (thêm `me`), `types/auth.types.ts`, `package.json` (thêm `bcryptjs`, `jsonwebtoken`, `@types/jsonwebtoken`), test như trên. `bcryptjs` phải khai báo ở backend vì ở gốc nó chỉ là devDependency (lock đánh dấu `dev`), image production sẽ thiếu nếu chỉ cài dependencies.

**Frontend**: `views/auth/` (LoginView, RegisterView, AuthField, auth.module.css, describe-error), `features/auth/` (`auth.service.ts` kèm `authorizedRequest`, `session.ts`, `useSession.ts`, `return-url.ts`, `validation.ts`, `AccountNav`), `types/auth.ts`, `lib/api-client.ts`. `lib/api.ts` có `server-only` nên trình duyệt không import được; vì vậy client chạy trong trình duyệt nằm ở `api-client.ts`.

**Gốc repo**: `package.json` (script `lint`; devDependencies `eslint`, `@eslint/js`, `typescript-eslint`, `globals`), `eslint.config.mjs`, `.github/workflows/ci.yml`, `.env_vidu`, tài liệu này.

## 4. Hợp đồng API và cách TV4/5/6 dùng guard

| Endpoint              | Body                  | Thành công                                        | Lỗi                                                         |
| --------------------- | --------------------- | ------------------------------------------------- | ----------------------------------------------------------- |
| `POST /auth/register` | `{ email, password }` | 201 `{ user }`                                    | 400 `VALIDATION_FAILED` (+`errors`), 409 `EMAIL_TAKEN`, 503 |
| `POST /auth/login`    | `{ email, password }` | 200 `{ accessToken, tokenType, expiresIn, user }` | 400, 401 `INVALID_CREDENTIALS`, 503                         |
| `GET /auth/me`        | header Bearer         | 200 `{ user }`                                    | 401 (3 mã token), 404, 503                                  |

`user = { id, email, displayName, loyaltyPoints }`. Mật khẩu 8 đến 72 byte, có chữ và số. 24 tài khoản seed `khach01@brewlite.test` đến `khach24@brewlite.test` đăng nhập được bằng `BrewLite123!`.

```ts
@Post(CUSTOMER_ROUTES.orders.create)
@UseGuards(JwtAuthGuard)
createOrder(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
  return this.orders.createOrder(user.id, body); // userId luôn lấy từ JWT, không tin userId trong body
}
```

**Client API riêng của từng TV (ví dụ `frontend/src/lib/client-api.ts` của TV6)** chỉ cần lấy token từ phiên đăng nhập, không tự lưu hay đọc token ở chỗ khác. Hàm `getAccessToken()` trong file đó phải là:

```ts
import { clearSession, loadSession } from "@/features/auth/session";

function getAccessToken(): string | null {
  return loadSession()?.accessToken ?? null; // phiên quá hạn hoặc chưa đăng nhập => null
}
// và trong request(), ngay trước `if (!response.ok)`:
if (response.status === 401 && token) clearSession(); // server từ chối token => xóa phiên cho khớp giao diện
```

Nếu `getAccessToken()` vẫn `return null` thì mọi trang gọi API cần đăng nhập sẽ không gửi token và luôn nhận 401 (người dùng thấy "bắt đăng nhập" dù đã đăng nhập). TV5 cần kiểm tra client gọi thanh toán của mình theo cách này.

**Trang cần đăng nhập (đơn của tôi, chi tiết đơn, thanh toán) phải dùng `useRequireSession()`** từ `@/features/auth/useRequireSession`. Đừng tự viết `const s = useSession(); if (!s) chuyển /login`: ở lần render đầu (server render và hydrate) chưa đọc được `localStorage` nên `useSession()` tạm trả `null` và trang sẽ đẩy người đã đăng nhập sang `/login`. Hook này trả `status` là `loading`, `authenticated` hoặc `unauthenticated`, và chỉ chuyển về `/login` (kèm `returnUrl`) khi thật sự không có phiên. Không kiểm tra đăng nhập trong server component, vì server không đọc được `localStorage`.

```tsx
const { status } = useRequireSession();
useEffect(() => {
  if (status !== "authenticated") return;
  authorizedRequest<Order[]>("/orders/me").then(setOrders);
}, [status]);
if (status !== "authenticated") return <p>Đang tải...</p>;
```

Phía web gọi `authorizedRequest<T>(path, { method, body })` từ `@/features/auth/auth.service`: tự gắn token, gặp 401 thì xóa phiên và đưa về `/login?returnUrl=...`. Guard chỉ kiểm tra token, không truy vấn DB; TV4/5/6 vẫn phải kiểm tra chủ đơn.

## 5. Biến môi trường (`.env_vidu` đã được cập nhật)

`JWT_SECRET` (mẫu local, ≥ 32 ký tự), `JWT_EXPIRES_IN_SECONDS=3600`, `NEXT_PUBLIC_API_BASE_URL=http://localhost:4000` (URL API mà trình duyệt gọi, được nhúng vào bundle web lúc build; không bao giờ đặt secret vào biến `NEXT_PUBLIC_*`).

**Quan trọng về `JWT_SECRET`:** giá trị cũ trong `.env_vidu` (`replace_before_implementing_auth`) dài đúng 32 ký tự và là chuỗi công khai, nên nếu dùng nó thì ai cũng tự tạo được token hợp lệ. Backend giờ từ chối chuỗi cũ đó, từ chối giá trị mẫu local khi `NODE_ENV=production`, và in cảnh báo khi dùng giá trị mẫu local. **Ai đã có `.env` cũ phải lấy dòng `JWT_SECRET` mới từ `.env_vidu`, nếu không `npm run dev` sẽ dừng với thông báo nêu rõ cách sửa.** Production: tạo secret riêng bằng `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` và đặt `NODE_ENV=production` (TV6 cần đảm bảo biến này trong môi trường deploy; nếu thiếu, backend chỉ cảnh báo chứ không chặn).

Nhắn TV1: service api trong Compose cần `JWT_SECRET`, `DB_*`, `FRONTEND_ORIGIN`; service web cần `NEXT_PUBLIC_API_BASE_URL` lúc build.

## 6. Chạy và kiểm tra (tại gốc repo)

1. **`npm install` ở gốc repo (không chạy trong `backend/`), rồi commit `package-lock.json`.** Lock hiện chưa có `jsonwebtoken`, `@types/jsonwebtoken` và ESLint, nên `npm ci` (CI) sẽ báo lock lệch cho đến khi bước này xong. Kiểm lại bằng `npm ci`.
2. `npm run format` (prettier) để căn lại định dạng file mới theo cấu hình của nhóm.
3. `npm run typecheck && npm run lint && npm test && npm run build`.
4. Thử tay: `npm run db:migrate && npm run db:seed`, chạy `npm run dev`, vào `/login` đăng nhập `khach01@brewlite.test` / `BrewLite123!`; hoặc gọi `POST /auth/login` rồi `GET /auth/me` với header `Authorization: Bearer <accessToken>`.

## 7. CI, branch protection và minh chứng (cần làm trên GitHub)

Workflow **Check scaffold**, job **`check`**: báo tên này cho TV6. `ci.yml` chạy `npm ci`, `typecheck`, `lint`, `test`, `build` ở gốc (npm workspaces, một lock ở gốc); `npm run lint` chạy `eslint .` một lần cho cả hai thư mục bằng `eslint.config.mjs`.

1. Đẩy nhánh `tv3-auth-ci`, mở PR để workflow chạy ít nhất một lần.
2. Settings → Branches → Add branch protection rule, pattern `main`: bật _Require a pull request before merging_, bật _Require status checks to pass_ và chọn `check`, bật _Require branches to be up to date_. Cần quyền admin nên làm cùng chủ repo. `ci.yml` cũng chạy khi push vào `scaffold/brewlite-customer`; nếu nhánh đó còn dùng thì áp quy tắc tương tự.
3. Minh chứng "CI qua": chụp PR có dấu tick xanh.
4. Minh chứng "CI phát hiện lỗi": tạo nhánh tạm, cố ý thêm `if (1 == 1) {}` (vi phạm `eqeqeq`) hoặc sửa một test cho sai, đẩy lên, chụp PR đỏ và nút Merge bị chặn, rồi đóng PR tạm.

## 8. Việc cần chốt với nhóm: cách lưu/gửi phiên

Đã chọn: JWT lưu `localStorage` (key `brewlite.session`), gửi bằng `Authorization: Bearer`. Lý do: backend đã bật CORS để trình duyệt gọi thẳng API, và TV2/TV5/TV6 chỉ cần gọi `authorizedRequest`. Rủi ro: script XSS đọc được token, nên không render HTML thô từ dữ liệu người dùng. Phương án thay thế là cookie httpOnly qua route handler của Next: an toàn hơn nhưng TV2/4/5/6 phải đổi cách gọi API. Hãy hỏi nhóm trước khi merge; đổi quyết định sẽ chủ yếu ảnh hưởng `session.ts` và `api-client.ts`.

## 9. Đã kiểm chứng và chưa

**Đã chạy thật trên bản merge của nhóm** (thư viện thật trong `node_modules`: Nest 12.2.0, pg, PGlite, bcryptjs 3.0.3, jsonwebtoken 9.0.3, TypeScript 5.9.3, ESLint 9.39.5, Prettier 3.9.10):

- `tsc --noEmit` backend và frontend: sạch.
- `eslint .` toàn repo: 0 lỗi, 73 cảnh báo (cảnh báo không làm đỏ CI).
- Toàn bộ test backend: **84/84 qua** (trước khi sửa là 78/79; ca đỏ là `/products/abc` lỗi thời trong `menu.test.ts`).
- `orders-auth.test.ts`: dựng cả `AppModule` với PGlite có schema và seed thật, đi qua HTTP. Khi tạm bỏ guard, 5/5 test đỏ; có guard thì 5/5 xanh.
- Đầu-cuối trong Chromium thật với backend thật: trên `main` cũ, đăng nhập xong `/orders` hiện "Bạn cần đăng nhập" (0 đơn) trong khi header ghi "Xin chào"; bản sửa hiện đủ 4 đơn, tải lại vẫn còn, token bị từ chối thì xóa phiên và header về "Đăng nhập".
- Prettier: các file của TV3 đã đúng định dạng.

**Chưa kiểm chứng được:** chạy trên GitHub Actions; `next build` và chạy trang trong Next.js 16 thật (bản `node_modules` là của Windows nên không chạy được trong môi trường kiểm thử, tôi dùng bản giả `next/link` và `next/navigation`); mở `/login`, `/register`, `/orders` bằng mắt ở desktop và 360px.

## 10. Rủi ro và việc nên làm thêm

- Chưa có giới hạn số lần đăng nhập sai và chưa có refresh token (hết 1 giờ thì đăng nhập lại, giỏ vẫn giữ).
- Đăng ký trùng trả 409 (tiện cho người dùng nhưng cho biết email đã tồn tại); đăng nhập thì cố ý dùng một thông báo chung và luôn chạy bcrypt để thời gian phản hồi không lộ email.
- Validation viết tay thay vì `class-validator` (không có trong dependencies).
- `tests/e2e/checkout.spec.todo.ts` ghi TV3 sẽ ghép E2E vào CI sau; chưa làm vì các luồng đặt hàng và thanh toán chưa xong.
- Nhắn nhóm: TV2 chuyển người chưa đăng nhập sang `/login?returnUrl=/checkout` (hoặc dùng `authorizedRequest`); TV4/5/6 dùng `JwtAuthGuard` + `@CurrentUser()` rồi mới bỏ 501 của route mình.
- API đơn của TV4 (`POST /orders`, `POST /orders/:id/cancel`) và thanh toán của TV5 hiện vẫn là khung trả 501 nên chưa gắn guard; khi triển khai, gắn `@UseGuards(JwtAuthGuard)` và `@CurrentUser()` rồi sửa test 501 của route đó (`orders-auth.test.ts` là mẫu).
- `package.json` gốc đang có thêm mục `dependencies.jsonwebtoken` (do chạy `npm i` ở gốc); backend đã khai báo riêng. Dọn bằng `npm uninstall jsonwebtoken` ở gốc repo rồi commit lại `package-lock.json`.
- `.env_vidu` có `NEXT_PUBLIC_SEPAY_WEBHOOK_API_KEY`: mọi biến `NEXT_PUBLIC_*` bị nhúng vào trình duyệt, nên không bao giờ đặt khóa thật vào đó (nhờ TV5 xem lại tên biến, giá trị mẫu hiện là một URL).
- `npm run format` hiện sẽ sửa 48 file ngoài phạm vi TV3 (chủ yếu do khác biệt kiểu xuống dòng và dòng dài); nên làm trong một commit riêng của cả nhóm, đừng gộp vào PR Auth.
- Đừng gửi hoặc commit file `.env` (chứa cấu hình cục bộ của bạn); `.gitignore` đã chặn, nhưng nhớ khi nén thư mục để gửi.

## 11. Quên mật khẩu

**Luồng người dùng:** trang `/login` có link "Quên mật khẩu?" dẫn tới `/forgot-password`. Người dùng nhập email, nhận thư chứa liên kết `/reset-password#token=...`, mở liên kết, nhập mật khẩu mới rồi được đưa về `/login` để đăng nhập bằng mật khẩu mới.

| Endpoint                     | Body                  | Thành công                                                           | Lỗi                                                                                                    |
| ---------------------------- | --------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `POST /auth/forgot-password` | `{ email }`           | 200 `{ message }`, **luôn cùng một thông báo** dù email có hay không | 400 `VALIDATION_FAILED` (email sai định dạng), 503                                                     |
| `POST /auth/reset-password`  | `{ token, password }` | 200 `{ message }`                                                    | 400 `VALIDATION_FAILED` (mật khẩu yếu), 400 `RESET_TOKEN_INVALID` (hết hạn/đã dùng/không có thật), 503 |

**Cơ sở dữ liệu:** bảng mới `password_reset_tokens` trong `backend/database/008_password_reset.sql`. Chạy `npm run db:migrate` (runner tự nhận file mới). Bảng này thuộc schema dùng chung nên cần báo nhóm trước khi merge.

**Thiết kế bảo mật:**

- Token ngẫu nhiên 256 bit; DB chỉ lưu mã băm SHA-256, nên lộ DB cũng không dùng được token. Mặc định hết hạn sau 30 phút (`PASSWORD_RESET_EXPIRES_IN_MINUTES`).
- Dùng đúng một lần: đổi mật khẩu, đánh dấu token đã dùng và vô hiệu hóa mọi token khác của tài khoản nằm trong **một câu SQL** nên hai request song song cùng token chỉ một cái thành công. Yêu cầu liên kết mới sẽ vô hiệu hóa liên kết cũ.
- Không lộ email nào đã đăng ký: `forgot-password` luôn trả cùng phản hồi; email được gửi không chặn phản hồi.
- Giới hạn tần suất theo tài khoản, tính trong DB: tối đa 1 yêu cầu mỗi 60 giây và 5 yêu cầu mỗi giờ.
- Liên kết đặt token sau dấu `#` để token không bị gửi lên máy chủ web hay header Referer; trang đặt mật khẩu đọc token rồi xóa nó khỏi thanh địa chỉ. Địa chỉ web trong liên kết lấy từ cấu hình, không lấy từ header của request.
- Email chỉ là văn bản thuần (không HTML). Production không bao giờ in liên kết vào log.

**Gửi email:** mặc định `ConsoleMailer` in liên kết ra console của backend khi phát triển (tìm dòng `[DEV] Liên kết đặt lại mật khẩu`). Muốn gửi email thật: chạy `npm install nodemailer -w backend` rồi đặt `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` trong `.env` (mẫu trong `.env_vidu`). Nếu đặt `SMTP_HOST` mà chưa cài `nodemailer`, thao tác gửi sẽ ghi lỗi rõ ràng vào log.

**Cách thử tay:** chạy `npm run db:migrate`, `npm run dev`, mở `/login`, bấm "Quên mật khẩu?", nhập `khach01@brewlite.test`, rồi sao chép liên kết từ console của backend dán vào trình duyệt.

**Giới hạn đã biết:**

- Đổi mật khẩu **không** thu hồi JWT đã cấp: phiên đăng nhập cũ vẫn dùng được tới khi hết hạn (mặc định 1 giờ). Muốn thu hồi ngay cần thêm cột phiên bản token và kiểm tra trong guard (tốn một truy vấn DB cho mỗi request cần đăng nhập, ảnh hưởng mọi TV nên cần nhóm quyết định).
- Chưa giới hạn theo địa chỉ IP. Giới hạn theo tài khoản cũng có nghĩa kẻ xấu có thể chiếm hết 5 lượt trong giờ để người thật tạm thời không yêu cầu được liên kết mới.
- Thời gian phản hồi giữa email có và không có tài khoản chênh nhau vài mili giây (chỉ có truy vấn ghi thêm), chưa san bằng.
- Đăng ký tài khoản vẫn trả 409 khi email đã tồn tại, nên vẫn dò được email đã đăng ký qua trang đăng ký (đánh đổi vì trải nghiệm).
- `SmtpMailer` mới chỉ được kiểm thử với nodemailer giả, chưa thử với máy chủ SMTP thật.

**Đã kiểm chứng (thư viện thật):** 105/105 test backend qua, trong đó 21 test mới (12 test đơn vị và 9 test tích hợp đi qua HTTP với PGlite có schema thật cộng migration 008); khi tạm phá 5 chỗ quan trọng (bỏ điều kiện "chưa dùng", bỏ điều kiện "còn hạn", không vô hiệu hóa liên kết cũ, không vô hiệu hóa token khác, lộ email chưa đăng ký) test đều đỏ. `tsc` backend và frontend sạch, ESLint 0 lỗi. Kịch bản trình duyệt thật với backend thật: 11/11 qua (link từ trang đăng nhập, email lạ và email thật nhận cùng thông báo, token bị xóa khỏi thanh địa chỉ, đặt mật khẩu thành công rồi đăng nhập bằng mật khẩu mới, dùng lại liên kết bị từ chối, 360px không tràn ngang). Chưa kiểm chứng: `next build`, gửi email qua SMTP thật, chạy trên GitHub Actions.
