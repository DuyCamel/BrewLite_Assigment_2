"use client";
// TV3 — Hooks đọc phiên đăng nhập, tự cập nhật khi đăng nhập/đăng xuất (kể cả ở tab khác).
// Lần render đầu (SSR và hydrate) chưa đọc được localStorage, nên KHÔNG được hiểu "chưa có phiên" là "chưa đăng nhập".
// Trang cần đăng nhập hãy dùng useRequireSession() (file useRequireSession.ts), đừng tự viết `if (!session) chuyển /login`.
import { useMemo, useSyncExternalStore } from "react";
import {
  parseSession,
  readRawSession,
  SESSION_CHANGED_EVENT,
  type StoredSession,
} from "./session";
export type SessionState =
  | { status: "loading"; session: null }
  | { status: "authenticated"; session: StoredSession }
  | { status: "unauthenticated"; session: null };
const LOADING: SessionState = { status: "loading", session: null };
const UNAUTHENTICATED: SessionState = {
  status: "unauthenticated",
  session: null,
};
function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(SESSION_CHANGED_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(SESSION_CHANGED_EVENT, onChange);
  };
}
const subscribeNever = () => () => {};
function getServerSnapshot(): string | null {
  return null;
}
// loading: server render hoặc lần hydrate đầu. authenticated/unauthenticated: đã đọc xong localStorage.
export function useSessionState(): SessionState {
  const ready = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
  // Snapshot là chuỗi thô (so sánh theo giá trị) nên không gây render lặp.
  const raw = useSyncExternalStore(
    subscribe,
    readRawSession,
    getServerSnapshot,
  );
  const session = useMemo(() => parseSession(raw), [raw]);
  return useMemo<SessionState>(
    () =>
      !ready
        ? LOADING
        : session
          ? { status: "authenticated", session }
          : UNAUTHENTICATED,
    [ready, session],
  );
}
// Chỉ để hiển thị (ví dụ tên trên header). null có thể nghĩa là "chưa đọc xong": KHÔNG dùng để quyết định chuyển trang.
export function useSession(): StoredSession | null {
  return useSessionState().session;
}
