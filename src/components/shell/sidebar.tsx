"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { menu } from "@/config/menu";
import { cn } from "@/lib/format";

interface Props {
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  badges: Record<string, number>;
  email: string;
}

export function Sidebar({ collapsed, onToggleCollapse, mobileOpen, onCloseMobile, badges, email }: Props) {
  const pathname = usePathname();

  const nav = (
    <nav aria-label="Phân hệ" className="flex flex-col gap-0.5">
      {menu.map((m) => {
        const active = pathname === m.href || pathname.startsWith(m.href + "/");
        const Icon = m.icon;
        const badge = badges[m.href];
        return (
          <Link
            key={m.key}
            href={m.href}
            onClick={onCloseMobile}
            aria-current={active ? "page" : undefined}
            aria-label={collapsed ? m.label : undefined}
            data-tip={collapsed ? m.label : undefined}
            className={cn(
              "flex h-10 items-center gap-3 rounded-lg px-2.5 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-jade",
              active ? "bg-jade-soft font-semibold text-jade-ink" : "text-ink-2 hover:bg-surface hover:text-ink",
              collapsed && "justify-center px-0",
            )}
          >
            <Icon size={18} className={cn("shrink-0", active ? "text-jade" : "text-ink-3")} aria-hidden />
            {!collapsed && <span className="flex-1 truncate">{m.label}</span>}
            {!collapsed && badge ? <span className="num rounded-full bg-amber-soft px-1.5 text-[11px] font-semibold text-amber">{badge}</span> : null}
            {collapsed && badge ? <span className="absolute right-2 top-1.5 h-1.5 w-1.5 rounded-full bg-amber" aria-hidden /> : null}
          </Link>
        );
      })}
    </nav>
  );

  const brand = (
    <div className={cn("flex items-center gap-2.5", collapsed && "justify-center")}>
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-jade text-[14px] font-bold text-white">B</div>
      {!collapsed && (
        <div className="min-w-0 leading-tight">
          <div className="truncate text-[13px] font-bold text-ink">BAOR AI OS</div>
          <div className="truncate text-[11px] text-ink-2">Marketing Automation</div>
        </div>
      )}
    </div>
  );

  const footer = (
    <div className="mt-auto flex flex-col gap-2 border-t border-border pt-3">
      <div className={cn("flex items-center gap-2 px-2 text-[11.5px] text-ink-2", collapsed && "justify-center px-0")} title="Hệ thống đang hoạt động">
        <span className="live" aria-hidden />
        {!collapsed && <span>Hệ thống đang hoạt động</span>}
      </div>
      <div className={cn("flex items-center gap-2.5 rounded-lg px-2 py-1.5", collapsed && "justify-center px-0")} data-tip={collapsed ? email : undefined}>
        <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-amber-soft text-[12px] font-bold text-amber" aria-hidden>
          {email.slice(0, 1).toUpperCase()}
        </div>
        {!collapsed && (
          <div className="min-w-0 leading-tight">
            <div className="truncate text-[12.5px] font-semibold text-ink">Chủ fanpage</div>
            <div className="truncate text-[11px] text-ink-2">{email}</div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Máy tính */}
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col gap-4 border-r border-border bg-ground-2 px-3 py-4 transition-[width] duration-200 md:flex",
          collapsed ? "w-[var(--sidebar-collapsed-w)]" : "w-[var(--sidebar-w)]",
        )}
      >
        <div className={cn("flex items-center", collapsed ? "flex-col gap-3" : "justify-between")}>
          {brand}
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? "Mở rộng menu" : "Thu gọn menu"}
            data-tip={collapsed ? "Mở rộng menu" : undefined}
            className="grid h-7 w-7 cursor-pointer place-items-center rounded-md text-ink-3 hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-jade"
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>
        {nav}
        {footer}
      </aside>

      {/* Điện thoại: menu trượt */}
      {mobileOpen && <div className="fixed inset-0 z-[55] bg-black/40 md:hidden" onClick={onCloseMobile} aria-hidden />}
      <aside
        aria-hidden={!mobileOpen}
        className={cn(
          "fixed inset-y-0 left-0 z-[56] flex w-[280px] max-w-[85vw] flex-col gap-4 border-r border-border bg-ground-2 px-3 py-4 transition-transform duration-200 md:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between">
          {brand}
          <button type="button" onClick={onCloseMobile} aria-label="Đóng menu" className="grid h-7 w-7 cursor-pointer place-items-center rounded-md text-ink-3 hover:bg-surface hover:text-ink">
            <X size={16} />
          </button>
        </div>
        {nav}
        {footer}
      </aside>
    </>
  );
}
