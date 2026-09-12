"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Activity, Bell, ChevronDown, Keyboard, KeyRound, LayoutDashboard, LogOut, Menu, Monitor, Moon, Plus, PanelsTopLeft, Search, Sparkles, Sun, User } from "lucide-react";
import { themeModeLabel, type ThemeMode } from "@/lib/client-store";
import { createActions, findMenuByPath } from "@/config/menu";
import { logoutAction } from "@/app/login/actions";
import { cn, formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import type { Health } from "@/lib/shell-types";
import type { ShellUser } from "./app-shell";
import { BrandMark, type BrandLogos } from "./brand-mark";

interface Props {
  user: ShellUser;
  unread: number;
  isDark: boolean;
  themeMode: ThemeMode;
  health: Health;
  logos: BrandLogos;
  viewOnly: boolean;
  onToggleView: () => void;
  onToggleTheme: () => void;
  onOpenMobileMenu: () => void;
  onOpenNotifications: () => void;
  onOpenAssistant: () => void;
  onOpenShortcuts: () => void;
}

function useOutsideClose(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && close();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

const iconBtn = "grid h-9 w-9 cursor-pointer place-items-center rounded-full text-ink-2 hover:bg-ground-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-jade";
const permissionName = { admin: "Quản trị", manager: "Quản lý", staff: "Nhân viên" } as const;

export function Topbar({ user, unread, isDark, themeMode, health, logos, viewOnly, onToggleView, onToggleTheme, onOpenMobileMenu, onOpenNotifications, onOpenAssistant, onOpenShortcuts }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const current = findMenuByPath(pathname);
  const [createOpen, setCreateOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [healthOpen, setHealthOpen] = useState(false);
  const [search, setSearch] = useState("");
  const createRef = useOutsideClose(createOpen, () => setCreateOpen(false));
  const accountRef = useOutsideClose(accountOpen, () => setAccountOpen(false));
  const healthRef = useOutsideClose(healthOpen, () => setHealthOpen(false));
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA";
      if ((e.key === "/" && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k")) {
        e.preventDefault();
        // Trên điện thoại ô tìm kiếm ẩn: mở trang tìm kiếm.
        if (searchRef.current && searchRef.current.offsetParent !== null) searchRef.current.focus();
        else router.push("/search");
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [router]);

  const dot = health.level === "error" ? "bg-brick" : health.level === "warn" ? "bg-amber" : "bg-jade";

  return (
    <header className="sticky top-0 z-40 flex h-[var(--topbar-h)] items-center gap-2 border-b border-border bg-ground/90 px-3 backdrop-blur md:px-5">
      {!viewOnly && (
        <button type="button" onClick={onOpenMobileMenu} aria-label="Mở menu" className={cn(iconBtn, "md:hidden")}>
          <Menu size={18} />
        </button>
      )}
      {viewOnly && (
        <Link href="/dashboard" className="flex shrink-0 items-center" aria-label="BAOR AI OS, về Điều hành">
          <BrandMark logos={logos} />
        </Link>
      )}
      <h1 className={cn("min-w-0 truncate text-[15px] font-bold text-ink", viewOnly && "font-medium text-ink-2")}>{viewOnly ? `· ${current?.label ?? ""}` : current?.label ?? "BAOR AI OS"}</h1>

      {/* Tìm kiếm toàn hệ thống: biểu mẫu GET tới /search */}
      <form
        role="search"
        action="/search"
        className="ml-2 hidden min-w-0 flex-1 items-center md:flex"
        onSubmit={(e) => {
          e.preventDefault();
          const q = search.trim();
          if (q) router.push(`/search?q=${encodeURIComponent(q)}`);
        }}
      >
        <label className="relative w-full max-w-[380px]">
          <span className="sr-only">Tìm kiếm toàn hệ thống</span>
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden />
          <input
            ref={searchRef}
            name="q"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm chiến dịch, nội dung, video, khách hàng…"
            className="h-9 w-full rounded-full border border-border-2 bg-surface pl-9 pr-12 text-[13px] text-ink outline-none placeholder:text-ink-3 focus-visible:outline-2 focus-visible:outline-jade"
          />
          <kbd aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-border-2 bg-ground px-1.5 font-sans text-[10.5px] leading-[16px] text-ink-3">/</kbd>
        </label>
      </form>

      {/* Điện thoại: ô tìm kiếm ẩn, dùng nút mở trang tìm kiếm */}
      <Link href="/search" aria-label="Tìm kiếm" className={cn(iconBtn, "ml-auto md:hidden")}>
        <Search size={18} />
      </Link>

      <div className="flex items-center gap-1 md:ml-auto">
        {!viewOnly && (
          <div ref={createRef} className="relative">
            <Button variant="primary" size="md" onClick={() => setCreateOpen((v) => !v)} aria-haspopup="menu" aria-expanded={createOpen}>
              <Plus size={16} aria-hidden />
              <span className="hidden sm:inline">Tạo mới</span>
              <ChevronDown size={14} aria-hidden />
            </Button>
            {createOpen && (
              <div role="menu" className="card absolute right-0 top-[calc(100%+6px)] z-50 w-[250px] p-1.5">
                {createActions.map((a) => {
                  const Icon = a.icon;
                  return (
                    <Link key={a.key} role="menuitem" href={a.href} onClick={() => setCreateOpen(false)} className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] text-ink hover:bg-ground-2 focus-visible:outline-2 focus-visible:outline-jade">
                      <Icon size={16} className="text-ink-3" aria-hidden />
                      <span className="flex-1">{a.label}</span>
                      {a.note && <span className="text-[10.5px] text-ink-3">{a.note}</span>}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Sức khỏe hệ thống: kết nối, bộ chạy nền, AI */}
        <div ref={healthRef} className="relative">
          <button type="button" onClick={() => setHealthOpen((v) => !v)} aria-haspopup="dialog" aria-expanded={healthOpen} aria-label={`Tình trạng hệ thống: ${health.summary}`} className={cn(iconBtn, "relative")}>
            <Activity size={18} />
            <span className={cn("absolute right-1.5 top-1.5 h-2 w-2 rounded-full", dot)} aria-hidden />
          </button>
          {healthOpen && (
            <div role="dialog" className="card absolute right-0 top-[calc(100%+6px)] z-50 w-[320px] p-3 text-[12.5px]">
              <div className="flex items-center gap-2 font-semibold text-ink"><span className={cn("h-2 w-2 rounded-full", dot)} aria-hidden />Tình trạng hệ thống</div>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-ink-2">
                <dt>Kết nối</dt><dd className="num text-ink">{health.connectedCount}/{health.realCount} nền tảng có adapter</dd>
                <dt>Bộ chạy nền</dt><dd className="text-ink">{health.schedulerRunning ? `đang chạy · ${health.lastTickAt ? formatDateTime(health.lastTickAt) : "chờ lần đầu"}` : "chưa chạy"}</dd>
                <dt>AI hôm nay</dt><dd className="num text-ink">{health.aiSpentPct}% trần ngày</dd>
                <dt>Lỗi 24h</dt><dd className="num text-ink">{health.failedRuns24h} lần đồng bộ lỗi</dd>
              </dl>
              {health.issues.length > 0 && (
                <ul className="mt-2 list-disc space-y-0.5 pl-4 text-ink">
                  {health.issues.slice(0, 5).map((x) => <li key={x}>{x}</li>)}
                </ul>
              )}
              <div className="mt-2.5 flex gap-2">
                <Link href="/settings#integrations" onClick={() => setHealthOpen(false)} className="font-medium text-jade hover:underline">Kết nối</Link>
                <Link href="/settings#syslog" onClick={() => setHealthOpen(false)} className="font-medium text-jade hover:underline">Nhật ký hệ thống</Link>
              </div>
            </div>
          )}
        </div>

        <button type="button" onClick={onOpenNotifications} aria-label={`Thông báo${unread ? `, ${unread} chưa đọc` : ""}`} className={cn(iconBtn, "relative")}>
          <Bell size={18} />
          {unread > 0 && <span className="num absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-brick px-1 text-[10px] font-bold text-white">{unread > 99 ? "99+" : unread}</span>}
        </button>

        <button type="button" onClick={onOpenAssistant} aria-label="Mở Trợ lý AI" className={cn(iconBtn, "text-violet hover:text-violet")}>
          <Sparkles size={18} />
        </button>

        {/* Chuyển giao diện: dashboard đầy đủ ↔ trang xem gọn */}
        <button type="button" onClick={onToggleView} aria-pressed={viewOnly} aria-label={viewOnly ? "Chuyển sang giao diện dashboard" : "Chuyển sang giao diện trang xem"} title={viewOnly ? "Giao diện dashboard" : "Giao diện trang xem"} className={cn(iconBtn, viewOnly && "bg-jade-soft text-jade-ink")}>
          {viewOnly ? <LayoutDashboard size={18} /> : <PanelsTopLeft size={18} />}
        </button>

        <button type="button" onClick={onToggleTheme} aria-label={`Chế độ màu: ${themeModeLabel[themeMode]}. Bấm để đổi.`} title={`Chế độ màu: ${themeModeLabel[themeMode]}`} className={iconBtn}>
          {themeMode === "system" ? <Monitor size={18} /> : isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <div ref={accountRef} className="relative">
          <button type="button" onClick={() => setAccountOpen((v) => !v)} aria-haspopup="menu" aria-expanded={accountOpen} aria-label="Tài khoản" className={cn(iconBtn, "ml-1")}>
            <span className="grid h-7 w-7 place-items-center rounded-full bg-amber-soft text-[12px] font-bold text-amber">{user.name.split(" ").slice(-1)[0]?.slice(0, 1).toUpperCase() || "?"}</span>
          </button>
          {accountOpen && (
            <div role="menu" className="card absolute right-0 top-[calc(100%+6px)] z-50 w-[250px] p-1.5">
              <div className="px-2.5 py-2 text-[12px] text-ink-2">
                <div className="font-semibold text-ink">{user.name}</div>
                <div className="truncate">{user.role} · {permissionName[user.permission]}</div>
                <div className="truncate text-ink-3">{user.email}</div>
              </div>
              <Link href="/account" role="menuitem" onClick={() => setAccountOpen(false)} className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-ink hover:bg-ground-2">
                <KeyRound size={16} className="text-ink-3" aria-hidden /> Tài khoản của tôi
              </Link>
              {user.permission === "admin" && (
                <Link href="/settings#people" role="menuitem" onClick={() => setAccountOpen(false)} className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-ink hover:bg-ground-2">
                  <User size={16} className="text-ink-3" aria-hidden /> Nhân sự và phân quyền
                </Link>
              )}
              <button type="button" role="menuitem" onClick={() => { setAccountOpen(false); onOpenShortcuts(); }} className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] text-ink hover:bg-ground-2">
                <Keyboard size={16} className="text-ink-3" aria-hidden /> <span className="flex-1">Phím tắt</span><kbd className="rounded border border-border-2 px-1 font-sans text-[10.5px] text-ink-3">?</kbd>
              </button>
              <form action={logoutAction}>
                <button type="submit" role="menuitem" className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] text-ink hover:bg-ground-2">
                  <LogOut size={16} className="text-ink-3" aria-hidden /> Đăng xuất
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
