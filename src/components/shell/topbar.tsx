"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Bell, ChevronDown, Menu, Moon, Plus, Search, Sparkles, Sun, User } from "lucide-react";
import { createActions, findMenuByPath, menu } from "@/config/menu";
import { cn } from "@/lib/format";
import { Dialog } from "@/components/ui/dialog";
import { Button, LinkButton } from "@/components/ui/button";

interface Props {
  email: string;
  unread: number;
  isDark: boolean;
  onToggleTheme: () => void;
  onOpenMobileMenu: () => void;
  onOpenNotifications: () => void;
  onOpenAssistant: () => void;
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

export function Topbar({ email, unread, isDark, onToggleTheme, onOpenMobileMenu, onOpenNotifications, onOpenAssistant }: Props) {
  const pathname = usePathname();
  const current = findMenuByPath(pathname);
  const [createOpen, setCreateOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [soon, setSoon] = useState<{ label: string; moduleKey: string } | null>(null);
  const [search, setSearch] = useState("");
  const createRef = useOutsideClose(createOpen, () => setCreateOpen(false));
  const accountRef = useOutsideClose(accountOpen, () => setAccountOpen(false));
  const searchRef = useRef<HTMLInputElement>(null);

  // Phím "/" đưa con trỏ vào ô tìm kiếm
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const soonModule = soon ? menu.find((m) => m.key === soon.moduleKey) : undefined;

  return (
    <header className="sticky top-0 z-40 flex h-[var(--topbar-h)] items-center gap-2 border-b border-border bg-ground/90 px-3 backdrop-blur md:px-5">
      <button type="button" onClick={onOpenMobileMenu} aria-label="Mở menu" className={cn(iconBtn, "md:hidden")}>
        <Menu size={18} />
      </button>

      <h1 className="min-w-0 truncate text-[15px] font-bold text-ink">{current?.label ?? "BAOR AI OS"}</h1>

      <form
        role="search"
        className="ml-2 hidden min-w-0 flex-1 items-center md:flex"
        onSubmit={(e) => {
          e.preventDefault();
          if (search.trim()) setSoon({ label: `Tìm kiếm “${search.trim()}”`, moduleKey: "dashboard" });
        }}
      >
        <label className="relative w-full max-w-[380px]">
          <span className="sr-only">Tìm kiếm toàn hệ thống</span>
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden />
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm nội dung, khách hàng, chiến dịch…  (phím /)"
            className="h-9 w-full rounded-full border border-border-2 bg-surface pl-9 pr-3 text-[13px] text-ink outline-none placeholder:text-ink-3 focus-visible:outline-2 focus-visible:outline-jade"
          />
        </label>
      </form>

      <div className="ml-auto flex items-center gap-1">
        <div ref={createRef} className="relative">
          <Button variant="primary" size="md" onClick={() => setCreateOpen((v) => !v)} aria-haspopup="menu" aria-expanded={createOpen}>
            <Plus size={16} aria-hidden />
            <span className="hidden sm:inline">Tạo mới</span>
            <ChevronDown size={14} aria-hidden />
          </Button>
          {createOpen && (
            <div role="menu" className="card absolute right-0 top-[calc(100%+6px)] z-50 w-[240px] p-1.5">
              {createActions.map((a) => {
                const Icon = a.icon;
                return (
                  <button
                    key={a.key}
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      setCreateOpen(false);
                      setSoon({ label: a.label, moduleKey: a.moduleKey });
                    }}
                    className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] text-ink hover:bg-ground-2 focus-visible:outline-2 focus-visible:outline-jade"
                  >
                    <Icon size={16} className="text-ink-3" aria-hidden />
                    {a.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <button type="button" onClick={onOpenNotifications} aria-label={`Thông báo${unread ? `, ${unread} chưa đọc` : ""}`} className={cn(iconBtn, "relative")}>
          <Bell size={18} />
          {unread > 0 && <span className="num absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-brick px-1 text-[10px] font-bold text-white">{unread}</span>}
        </button>

        <button type="button" onClick={onOpenAssistant} aria-label="Mở Trợ lý AI" className={cn(iconBtn, "text-violet hover:text-violet")}>
          <Sparkles size={18} />
        </button>

        <button type="button" onClick={onToggleTheme} aria-label={isDark ? "Chuyển sang chế độ sáng" : "Chuyển sang chế độ tối"} className={iconBtn}>
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <div ref={accountRef} className="relative">
          <button type="button" onClick={() => setAccountOpen((v) => !v)} aria-haspopup="menu" aria-expanded={accountOpen} aria-label="Tài khoản" className={cn(iconBtn, "ml-1")}>
            <span className="grid h-7 w-7 place-items-center rounded-full bg-amber-soft text-[12px] font-bold text-amber">{email.slice(0, 1).toUpperCase()}</span>
          </button>
          {accountOpen && (
            <div role="menu" className="card absolute right-0 top-[calc(100%+6px)] z-50 w-[240px] p-1.5">
              <div className="px-2.5 py-2 text-[12px] text-ink-2">
                <div className="font-semibold text-ink">Chủ fanpage</div>
                <div className="truncate">{email}</div>
              </div>
              <a href="/settings#account" role="menuitem" onClick={() => setAccountOpen(false)} className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-ink hover:bg-ground-2">
                <User size={16} className="text-ink-3" aria-hidden /> Tài khoản
              </a>
            </div>
          )}
        </div>
      </div>

      <Dialog
        open={!!soon}
        onClose={() => setSoon(null)}
        title={soon?.label ?? ""}
        footer={
          <>
            <Button onClick={() => setSoon(null)}>Đóng</Button>
            {soonModule && <LinkButton href={soonModule.href} variant="primary">Mở {soonModule.label}</LinkButton>}
          </>
        }
      >
        Chức năng này sẽ được phát triển ở phân hệ <b className="text-ink">{soonModule?.label}</b>. Hiện tại bạn có thể vào phân hệ đó để xem các nhóm chức năng dự kiến.
      </Dialog>
    </header>
  );
}
