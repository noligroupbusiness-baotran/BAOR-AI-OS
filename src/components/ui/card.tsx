import { cn } from "@/lib/format";

export function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <section className={cn("card mt-3.5 overflow-hidden", className)}>{children}</section>;
}

export function PanelHeader({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
      <div>
        <h2 className="text-[13px] font-bold text-ink">{title}</h2>
        {sub && <p className="mt-px text-[12px] text-ink-2">{sub}</p>}
      </div>
      {action}
    </header>
  );
}

export function PageHead({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-[18px] flex items-start justify-between gap-4">
      <div>
        <h1 className="text-[20px] font-bold tracking-[-0.01em] text-ink [text-wrap:balance]">{title}</h1>
        {sub && <p className="mt-1 max-w-[60ch] text-ink-2">{sub}</p>}
      </div>
      {action}
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
