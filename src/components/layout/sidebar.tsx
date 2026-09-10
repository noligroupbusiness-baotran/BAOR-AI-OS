"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/format";
import { navSections } from "./nav";

function isActive(pathname: string, search: string, href: string) {
  const [path, query] = href.split("?");
  if (pathname !== path) return false;
  const wantTab = query ? new URLSearchParams(query).get("tab") : null;
  const curTab = new URLSearchParams(search).get("tab");
  if (!wantTab) return !curTab;
  return curTab === wantTab;
}

export function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-[var(--sidebar-w)] flex-col border-r border-border bg-bg-elevated md:flex">
      <div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-[13px] font-black text-white shadow-sm">
          B
        </div>
        <div className="leading-tight">
          <div className="text-[13px] font-bold text-ink">BAOR AI OS</div>
          <div className="text-[10.5px] text-faint">Marketing Automation OS</div>
        </div>
      </div>

      <nav className="scroll-thin flex-1 overflow-y-auto px-2 pb-4">
        {navSections.map((section) => (
          <div key={section.label} className="mt-3">
            <div className="eyebrow px-2 pb-1">{section.label}</div>
            <ul className="space-y-[1px]">
              {section.items.map((item) => {
                const active = isActive(pathname, search, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "group flex items-center gap-2 rounded-md px-2 py-[5px] text-[12.5px] transition-colors",
                        active
                          ? "bg-primary-soft font-semibold text-primary-text"
                          : "text-muted hover:bg-surface-soft hover:text-ink",
                      )}
                    >
                      <span className="w-4 text-center text-[13px]" aria-hidden>
                        {item.emoji}
                      </span>
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.badge !== undefined && item.badge > 0 && (
                        <span
                          className={cn(
                            "rounded-full px-1.5 text-[10px] font-bold tabular-nums",
                            item.badgeTone === "red"
                              ? "bg-red-soft text-red"
                              : item.badgeTone === "gold"
                                ? "bg-gold-soft text-gold"
                                : "bg-primary-soft text-primary-text",
                          )}
                        >
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-border px-4 py-3 text-[10.5px] text-faint">
        <div className="flex items-center gap-1.5">
          <span className="dot-live inline-block h-1.5 w-1.5 rounded-full bg-primary" />
          Agent đang chạy · 3 tác vụ nền
        </div>
      </div>
    </aside>
  );
}
