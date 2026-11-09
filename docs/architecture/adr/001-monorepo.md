# ADR 001: Tổ chức mã nguồn theo npm workspaces monorepo (`apps/web`, `apps/api`)

- **Trạng thái:** Đã áp dụng

## Bối cảnh

Assignment 2 yêu cầu phát triển đồng thời frontend Next.js, backend NestJS, tài liệu kỹ thuật (`docs/`), kịch bản kiểm thử và CI/CD trong một kho mã nguồn có thể truy vết rõ ràng giữa yêu cầu, sơ đồ, code và test. Ở Assignment 1, mã nguồn đặt tại `frontend/` và `backend/`; sang Assignment 2 đề quy định cấu trúc chuẩn gồm `apps/web`, `apps/api` và `docs`.

## Quyết định

Sử dụng **npm workspaces** tại gốc repository (`package.json`) với hai workspace `apps/web` và `apps/api`, dùng chung một `package-lock.json`, cấu hình ESLint/Prettier/TypeScript và một tệp `.env` duy nhất ở thư mục gốc.

## Phương án thay thế đã cân nhắc

- **Tách nhiều repository (polyrepo):** Khó đồng bộ thay đổi hợp đồng API với giao diện trong cùng một pull request và khó duy trì ma trận truy vết tập trung.
- **Dùng công cụ điều phối thêm (Turborepo/Nx):** Tăng độ phức tạp cấu hình trong khi quy mô 2 ứng dụng chỉ cần các script `npm run ... --workspaces` có sẵn.

## Hệ quả

- **Ưu điểm:** Cài đặt một lần bằng `npm ci` ở gốc; một PR kiểm tra được cả typecheck, lint, test và build của web lẫn API; dễ đóng gói Docker multi-stage từ ngữ cảnh gốc.
- **Hạn chế:** `node_modules` gốc lớn hơn; Dockerfile của từng dịch vụ phải copy cả `package.json` gốc và hai `package.json` con để `npm ci` giải quyết đúng workspace.
