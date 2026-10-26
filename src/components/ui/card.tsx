import { cn } from "@/lib/format";
import type { LucideIcon } from "lucide-react";
import type { GroupTone } from "@/config/menu";
import { PageIcon } from "@/components/shell/page-icon";
import { IconChip } from "./icon-chip";
import { InfoTip } from "./info-tip";

export function Panel({ children, className, id }: { children: React.ReactNode; className?: string; id?: string }) {
  return <section id={id} className={cn("card appear appear--soft mt-3.5 overflow-hidden scroll-mt-20", className)}>{children}</section>;
}

// Tiêu đề khối: tuỳ chọn icon chip màu nhóm, nút (i) giải thích (info) thay cho đoạn văn dài, và nhãn ngắn (tags).
export function PanelHeader({ title, sub, action, icon, tone, info, tags }: { title: string; sub?: string; action?: React.ReactNode; icon?: LucideIcon; tone?: GroupTone; info?: React.ReactNode; tags?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border px-4 py-3">
      <div className="flex min-w-0 items-center gap-2.5">
        {icon && <IconChip icon={icon} tone={tone} size="sm" />}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <h2 className="text-[13px] font-bold text-ink">{title}</h2>
            {info && <InfoTip label={`Giải thích: ${title}`}>{info}</InfoTip>}
            {tags}
          </div>
          {sub && <p className="mt-px text-[12px] text-ink-2">{sub}</p>}
        </div>
      </div>
      {action}
    </header>
  );
}

export function PageHead({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-[18px] flex items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3">
        <PageIcon className="appear appear--pop mt-px" />
        <div className="min-w-0">
          <h1 className="appear appear--mask text-[20px] font-bold tracking-[-0.01em] text-ink [text-wrap:balance]">{title}</h1>
          {sub && <p className="appear appear--soft mt-1 max-w-[60ch] text-ink-2 [--d:1]">{sub}</p>}
        </div>
      </div>
      {action && <div className="appear appear--btn [--d:2]">{action}</div>}
    </div>
  );
}

// Danh sách hàng: cột trái (nhãn), giữa (tiêu đề + mô tả), phải (hành động)
export function Rows({ children }: { children: React.ReactNode }) {
  return <ul className="m-0 list-none p-0">{children}</ul>;
}

export function Row({ lead, title, sub, action, extra }: { lead?: React.ReactNode; title: React.ReactNode; sub?: React.ReactNode; action?: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-border px-4 py-2.5 last:border-b-0">
      <div>{lead ?? null}</div>
      <div className="min-w-0">
        <div className="font-semibold text-ink">{title}</div>
        {sub && <div className="mt-px truncate text-[12px] text-ink-2">{sub}</div>}
        {extra}
      </div>
      <div>{action ?? null}</div>
    </li>
  );
}
