"use client";

import { useSyncExternalStore } from "react";

// Trạng thái giao diện lưu trong localStorage (thu gọn sidebar, chế độ màu), an toàn với SSR.
function createLocalStore<T extends string>(key: string, fallback: T) {
  const listeners = new Set<() => void>();
  const read = (): T => {
    try {
      return (localStorage.getItem(key) as T | null) ?? fallback;
    } catch {
      return fallback;
    }
  };
  return {
    get: read,
    set(value: T) {
      try {
        localStorage.setItem(key, value);
      } catch {}
      listeners.forEach((l) => l());
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    use(): T {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      return useSyncExternalStore(this.subscribe, read, () => fallback);
    },
  };
}

export type ThemeMode = "light" | "dark" | "system";
export const themeStore = createLocalStore<ThemeMode>("baor.theme", "system");
export const sidebarStore = createLocalStore<"open" | "collapsed">("baor.sidebar", "open");
// Giao diện: "dashboard" đầy đủ thanh bên; "view" trang xem gọn, ẩn thanh bên.
export const viewModeStore = createLocalStore<"dashboard" | "view">("baor.viewMode", "dashboard");
// Danh sách id thông báo đã đọc (ngăn cách bằng dấu phẩy).
export const readStore = createLocalStore<string>("baor.notifRead", "");

export function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  if (mode === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", mode);
}

export function effectiveTheme(mode: ThemeMode): "light" | "dark" {
  if (mode !== "system") return mode;
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

// Thứ tự bấm nút chế độ màu: theo hệ thống → sáng → tối → theo hệ thống.
export function nextThemeMode(mode: ThemeMode): ThemeMode {
  return mode === "system" ? "light" : mode === "light" ? "dark" : "system";
}
export const themeModeLabel: Record<ThemeMode, string> = { light: "Sáng", dark: "Tối", system: "Theo hệ thống" };
