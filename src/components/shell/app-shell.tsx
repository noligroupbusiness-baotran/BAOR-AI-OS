"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { NotificationPanel } from "./notification-panel";
import { AssistantPanel } from "./assistant-panel";
import { Toast } from "@/components/ui/toast";
import { applyTheme, effectiveTheme, readStore, sidebarStore, themeStore, viewModeStore } from "@/lib/client-store";
import type { Health, NotificationItem } from "@/lib/shell-types";
import type { BrandLogos } from "./brand-mark";
import { cn } from "@/lib/format";

export interface ShellUser {
  email: string;
  name: string;
  role: string;
  permission: "admin" | "manager" | "staff";
}

// Vỏ ứng dụng dùng chung. Hai chế độ: "dashboard" (đầy đủ thanh bên) và "view" (trang xem: ẩn thanh bên,
// nội dung rộng, chỉ giữ thanh trên tối giản). Tự làm mới dữ liệu mỗi phút khi tab đang mở.
export function AppShell({ user, badges, health, notifications, logos, children }: { user: ShellUser; badges: Record<string, number>; health: Health; notifications: NotificationItem[]; logos: BrandLogos; children: React.ReactNode }) {
  const router = useRouter();
  const sidebar = sidebarStore.use();
  const theme = themeStore.use();
  const viewMode = viewModeStore.use();
  const isDark = effectiveTheme(theme) === "dark";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const read = readStore.use();
  const readSet = new Set(read.split(",").filter(Boolean));
  const unread = notifications.filter((n) => !readSet.has(n.id)).length;

  const toggleTheme = useCallback(() => {
    const next = isDark ? "light" : "dark";
    themeStore.set(next);
    applyTheme(next);
  }, [isDark]);

  // Làm mới dữ liệu máy chủ mỗi 60 giây khi tab đang hiển thị (webhook, đồng bộ, việc mới).
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 60_000);
    return () => clearInterval(t);
  }, [router]);

  const viewOnly = viewMode === "view";

  return (
    <div className="flex min-h-screen">
      {!viewOnly && (
        <Sidebar
          collapsed={sidebar === "collapsed"}
          onToggleCollapse={() => sidebarStore.set(sidebar === "collapsed" ? "open" : "collapsed")}
          mobileOpen={mobileOpen}
          onCloseMobile={() => setMobileOpen(false)}
          badges={badges}
          user={user}
          health={health}
          logos={logos}
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          user={user}
          unread={unread}
          isDark={isDark}
          health={health}
          logos={logos}
          viewOnly={viewOnly}
          onToggleView={() => viewModeStore.set(viewOnly ? "dashboard" : "view")}
          onToggleTheme={toggleTheme}
          onOpenMobileMenu={() => setMobileOpen(true)}
          onOpenNotifications={() => setNotifOpen(true)}
          onOpenAssistant={() => setAssistantOpen(true)}
        />
        <main className={cn("w-full px-4 pb-12 pt-5 md:px-6", viewOnly ? "mx-auto max-w-[1400px] md:px-10" : "max-w-[1180px]")}>{children}</main>
      </div>
      <NotificationPanel open={notifOpen} onClose={() => setNotifOpen(false)} items={notifications} readSet={readSet} onRead={(ids) => readStore.set([...new Set([...readSet, ...ids])].slice(-300).join(","))} />
      <AssistantPanel open={assistantOpen} onClose={() => setAssistantOpen(false)} />
      <Suspense fallback={null}>
        <Toast />
      </Suspense>
    </div>
  );
}
