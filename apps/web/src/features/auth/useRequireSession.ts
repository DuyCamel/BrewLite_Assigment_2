"use client";
// TV3 — Dùng ở trang bắt buộc đăng nhập (đơn của tôi, chi tiết đơn, thanh toán).
// Chỉ chuyển về /login (kèm returnUrl của trang hiện tại) khi ĐÃ đọc xong và thật sự không có phiên hợp lệ.
//
//   const { status } = useRequireSession();
//   useEffect(() => {
//     if (status !== "authenticated") return;
//     authorizedRequest<Order[]>("/orders/me").then(setOrders);   // tự gắn token, 401 thì về /login
//   }, [status]);
//   if (status !== "authenticated") return <p>Đang tải...</p>;
import { useEffect } from "react";
import { authClient } from "./auth.service";
import { readRawSession } from "./session";
import { useSessionState, type SessionState } from "./useSession";
export function useRequireSession(): SessionState {
  const state = useSessionState();
  useEffect(() => {
    if (state.status !== "unauthenticated") return;
    // Còn dữ liệu phiên nhưng không hợp lệ nữa (quá hạn) => "hết hạn"; chưa từng đăng nhập => "cần đăng nhập".
    authClient.handleSessionExpired(readRawSession() ? "expired" : "required");
  }, [state.status]);
  return state;
}
