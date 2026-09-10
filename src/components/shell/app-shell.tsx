"use client";

import { Suspense, useCallback, useState } from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { NotificationPanel } from "./notification-panel";
import { AssistantPanel } from "./assistant-panel";
import { Toast } from "@/components/ui/toast";
import { applyTheme, effectiveTheme, sidebarStore, themeStore } from "@/lib/client-store";
import { notifications } from "@/lib/mock/notifications";

// Vỏ ứng dụng dùng chung: sidebar, thanh trên, bảng thông báo, trợ lý AI, thông báo ngắn.
export function AppShell({ email, badges, children }: { email: string; badges: Record<string, number>; children: React.ReactNode }) {
  const sidebar = sidebarStore.use();
  const theme = themeStore.use();
  const isDark = effectiveTheme(theme) === "dark";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [unread, setUnread] = useState(notifications.filter((n) => !n.read).length);

  const toggleTheme = useCallback(() => {
    const next = isDark ? "light" : "dark";
    themeStore.set(next);
    applyTheme(next);
  }, [isDark]);

  return (
    <div className="flex min-h-screen">
      <Sidebar
        collapsed={sidebar === "collapsed"}
        onToggleCollapse={() => sidebarStore.set(sidebar === "collapsed" ? "open" : "collapsed")}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        badges={badges}
        email={email}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          email={email}
          unread={unread}
          isDark={isDark}
          onToggleTheme={toggleTheme}
          onOpenMobileMenu={() => setMobileOpen(true)}
          onOpenNotifications={() => setNotifOpen(true)}
          onOpenAssistant={() => setAssistantOpen(true)}
        />
        <main className="w-full max-w-[1180px] px-4 pb-12 pt-5 md:px-6">{children}</main>
      </div>
      <NotificationPanel open={notifOpen} onClose={() => setNotifOpen(false)} onUnreadChange={setUnread} />
      <AssistantPanel open={assistantOpen} onClose={() => setAssistantOpen(false)} />
      <Suspense fallback={null}>
        <Toast />
      </Suspense>
    </div>
  );
}
