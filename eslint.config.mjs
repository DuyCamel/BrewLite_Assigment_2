// TV3 — ESLint quality gate cho cả hai workspace (frontend, backend). Chạy từ gốc repo: `npm run lint`. CI chạy sau typecheck, trước test; lỗi (error) sẽ chặn merge.
// Giai đoạn khung: no-unused-vars / no-explicit-any để ở mức cảnh báo vì nhiều file khung của các TV còn tham số chưa dùng.
// Khi các TV hoàn thiện xong, đổi hai rule này sang "error" để siết chặt.
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";
export default defineConfig([
  // next-env.d.ts do Next.js tự sinh và chứa /// <reference>, không thuộc code của nhóm.
  globalIgnores([
    "**/dist/**",
    "**/node_modules/**",
    "**/.next/**",
    "**/coverage/**",
    "**/next-env.d.ts",
  ]),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      eqeqeq: ["error", "always"],
    },
  },
  {
    files: ["**/*.mjs"],
    languageOptions: { globals: { ...globals.node } },
  },
]);
