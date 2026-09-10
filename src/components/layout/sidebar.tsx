"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/format";
import { navItems, settingsItem, type NavItem } from "./nav";

function Item({ item, active, badge }: { item: NavItem; active: boolean; badge?: number }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors",
        active ? "bg-jade-soft font-semibold text-jade-ink" : "text-ink-2 hover:bg-surface hover:text-ink",
      )}
    >
      <span
        className={cn(
          "grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] border text-[10.5px] font-bold",
          active ? "border-jade bg-jade text-white" : "border-border bg-surface text-ink-3",
        )}
      >
        {item.mark}
      </span>
      <span className="flex-1 truncate">{item.label}</span>
      {badge ? <span className="num text-[11px] font-semibold text-amber">{badge}</span> : null}
    </Link>
  );
}

export function Sidebar({ badges = {} }: { badges?: Record<string, number> }) {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-screen w-[var(--sidebar-w)] shrink-0 flex-col gap-5 border-r border-border bg-ground-2 px-3 py-[18px] md:flex">
      <div className="flex items-center gap-2.5 px-1.5">
        <div className="grid h-[30px] w-[30px] place-items-center rounded-lg bg-jade text-[14px] font-bold text-white">B</div>
        <div className="leading-tight">
          <div className="text-[13px] font-bold text-ink">BAOR AI OS</div>
          <div className="text-[11px] text-ink-2">Marketing cho fanpage</div>
        </div>
      </div>
      <nav className="flex flex-col gap-0.5">
        {navItems.map((item) => (
          <Item key={item.href} item={item} active={pathname === item.href} badge={badges[item.href]} />
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-2">
        <Item item={settingsItem} active={pathname === settingsItem.href} />
        <div className="flex items-center gap-1.5 px-1.5 text-[11px] text-ink-3">
          <span className="live" /> Agent đang chạy nền
        </div>
      </div>
    </aside>
  );
}

export function MobileNav({ badges = {} }: { badges?: Record<string, number> }) {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-border bg-ground-2 px-3 py-2 md:hidden">
      {[...navItems, settingsItem].map((item) => (
        <Item key={item.href} item={item} active={pathname === item.href} badge={badges[item.href]} />
      ))}
    </nav>
  );
}
