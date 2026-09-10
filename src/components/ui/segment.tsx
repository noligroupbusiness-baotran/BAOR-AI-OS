import Link from "next/link";
import { cn } from "@/lib/format";

export function Segment({ basePath, active, items }: { basePath: string; active: string; items: { key: string; label: string }[] }) {
  return (
    <div className="inline-flex rounded-full border border-border-2 bg-surface p-0.5" role="group">
      {items.map((it) => (
        <Link
          key={it.key}
          href={`${basePath}?tab=${it.key}`}
          aria-pressed={it.key === active}
          className={cn(
            "h-6 rounded-full px-2.5 text-[12px] font-medium leading-6",
            it.key === active ? "bg-jade text-white" : "text-ink-2 hover:text-ink",
          )}
        >
          {it.label}
        </Link>
      ))}
    </div>
  );
}
