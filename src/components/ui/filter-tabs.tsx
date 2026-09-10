import Link from "next/link";
import { cn } from "@/lib/format";

export interface TabDef {
  key: string;
  label: string;
  count?: number;
  emoji?: string;
}

export function FilterTabs({
  tabs,
  active,
  basePath,
  param = "tab",
}: {
  tabs: TabDef[];
  active: string;
  basePath: string;
  param?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tabs.map((t) => {
        const isActive = t.key === active;
        return (
          <Link
            key={t.key}
            href={`${basePath}?${param}=${t.key}`}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium transition-colors",
              isActive
                ? "border-primary bg-primary text-white"
                : "border-border bg-surface text-muted hover:border-border-strong hover:text-ink",
            )}
          >
            {t.emoji && <span aria-hidden>{t.emoji}</span>}
            {t.label}
            {t.count !== undefined && (
              <span
                className={cn(
                  "rounded-full px-1.5 text-[10.5px] tabular-nums",
                  isActive ? "bg-white/20" : "bg-surface-soft text-faint",
                )}
              >
                {t.count}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
