import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

// Khung dùng chung của Cài đặt (OWNER 25/10/2026: "từng phần vẫn lộn xộn, khó hiểu"): mỗi mục một dòng — tên, trạng thái, một câu
// tóm tắt; bấm mới mở phần nhập. Phần kỹ thuật ít dùng nằm trong "Nâng cao" (MoreOptions).
export function SettingItem({ id, title, badge, summary, open, children }: { id?: string; title: ReactNode; badge?: ReactNode; summary?: ReactNode; open?: boolean; children: ReactNode }) {
  return (
    <details id={id} open={open} className="group scroll-mt-20 border-b border-border last:border-b-0">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 hover:bg-ground focus-visible:outline-2 focus-visible:outline-jade [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-semibold text-ink">{title}</span>
          {badge}
          {summary && <span className="min-w-0 text-[12px] text-ink-3">{summary}</span>}
        </span>
        <ChevronDown aria-hidden size={16} className="shrink-0 text-ink-3 transition-transform group-open:rotate-180" />
      </summary>
      <div className="grid gap-3 px-4 pb-4 text-[13px]">{children}</div>
    </details>
  );
}

/** Danh sách mục trong một khối (đường kẻ trên cùng tách khỏi tiêu đề khối). */
export function SettingList({ children }: { children: ReactNode }) {
  return <div className="border-t border-border">{children}</div>;
}

/** Tiêu đề nhỏ chia nhóm mục trong một khối. */
export function SettingSection({ title }: { title: string }) {
  return <div className="border-b border-border bg-ground px-4 py-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-ink-3">{title}</div>;
}

/** Phần kỹ thuật / ít dùng: gập sẵn. */
export function MoreOptions({ label = "Nâng cao", children }: { label?: string; children: ReactNode }) {
  return (
    <details className="group/more text-[12.5px]">
      <summary className="flex cursor-pointer list-none items-center gap-1 text-ink-3 hover:text-ink [&::-webkit-details-marker]:hidden">
        <ChevronDown aria-hidden size={14} className="-rotate-90 transition-transform group-open/more:rotate-0" />
        {label}
      </summary>
      <div className="mt-2 grid gap-3">{children}</div>
    </details>
  );
}
