// TV3 — Chỉ khai báo đường dẫn; AuthController nhận request, AuthService xử lý.
export const AUTH_ROUTES = {
  base: "auth",
  register: "register",
  login: "login",
  me: "me",
  forgotPassword: "forgot-password",
  resetPassword: "reset-password",
} as const;
