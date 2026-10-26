import Link from "next/link";
import { cn } from "@/lib/format";

export function Segment({ basePath, active, items, paramName = "tab" }: { basePath: string; active: string; items: { key: string; label: string }[]; paramName?: string }) {
  return (
    <div className="inline-flex gap-0.5 rounded-[9px] border border-border-2 bg-surface p-0.5" role="group">
      {items.map((it) => (
        <Link
          key={it.key}
          href={`${basePath}${basePath.includes("?") ? "&" : "?"}${paramName}=${it.key}`}
          aria-pressed={it.key === active}
          className={cn(
            "h-6 px-2.5 text-[12px] font-medium leading-[22px]",
            it.key === active ? "metal-pill" : "tab-pill text-ink-2 hover:text-ink",
          )}
        >
          {it.label}
        </Link>
      ))}
    </div>
  );
}
