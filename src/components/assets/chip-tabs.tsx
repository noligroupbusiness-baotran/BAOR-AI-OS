"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/format";

export interface ChipGroup {
  key: string;
  label: string;
  /** Số nhỏ cạnh nhãn, vd "2/6" (đã duyệt / tổng) hoặc "5". */
  count?: string;
  content: ReactNode;
}

/** Hàng chip lọc dùng chung (Tư liệu): bấm để chọn, đang chọn = nền đậm. */
export function ChipRow({ items, active, onPick, label }: { items: { key: string; label: string; count?: string }[]; active: string; onPick: (key: string) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          onClick={() => onPick(it.key)}
          aria-pressed={it.key === active}
          className={cn(
            "inline-flex h-7 max-w-full cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-jade",
            it.key === active ? "border-transparent bg-ink text-surface" : "border-border-2 bg-surface text-ink-2 hover:border-ink-3 hover:text-ink",
          )}
        >
          <span className="truncate">{it.label}</span>
          {it.count && <span className={cn("num text-[11px]", it.key === active ? "opacity-75" : "text-ink-3")}>{it.count}</span>}
        </button>
      ))}
    </div>
  );
}

// Nhóm theo chip (thể loại nhạc, loại hiệu ứng): "Tất cả" hiện mọi nhóm, chọn một chip chỉ hiện nhóm đó. Nội dung do máy chủ dựng sẵn.
export function ChipTabs({ groups, allLabel = "Tất cả", allCount, label }: { groups: ChipGroup[]; allLabel?: string; allCount?: string; label: string }) {
  const [active, setActive] = useState("all");
  const shown = active === "all" ? groups : groups.filter((g) => g.key === active);
  return (
    <div className="grid gap-3">
      <ChipRow label={label} active={active} onPick={setActive} items={[{ key: "all", label: allLabel, count: allCount }, ...groups.map(({ key, label: l, count }) => ({ key, label: l, count }))]} />
      {shown.map((g) => (
        <div key={g.key}>
          {active === "all" && groups.length > 1 && <div className="lbl mb-1.5">{g.label}</div>}
          {g.content}
        </div>
      ))}
    </div>
  );
}
