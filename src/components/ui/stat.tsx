import { cn } from "@/lib/format";

export function StatTile({
  label,
  value,
  delta,
  hint,
  className,
}: {
  label: string;
  value: string;
  delta?: number;
  hint?: string;
  className?: string;
}) {
  const up = (delta ?? 0) >= 0;
  return (
    <div
      className={cn(
        "rounded-[var(--radius)] border border-border bg-surface px-4 py-3 shadow-[0_1px_2px_rgba(30,30,20,0.04)]",
        className,
      )}
    >
      <div className="eyebrow">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <div className="text-[20px] font-bold tabular-nums tracking-tight text-ink">{value}</div>
        {delta !== undefined && (
          <span
            className={cn(
              "text-[11px] font-semibold tabular-nums",
              up ? "text-primary-text" : "text-red",
            )}
          >
            {up ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}%
          </span>
        )}
      </div>
      {hint && <div className="mt-0.5 text-[11px] text-faint">{hint}</div>}
    </div>
  );
}

export function MiniStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-[110px]">
      <div className="eyebrow">{label}</div>
      <div className="mt-0.5 text-[15px] font-bold tabular-nums text-ink">{value}</div>
      {sub && <div className="text-[10.5px] text-faint">{sub}</div>}
    </div>
  );
}

export function ProgressBar({
  value,
  tone = "green",
  className,
}: {
  value: number;
  tone?: "green" | "gold" | "red" | "blue";
  className?: string;
}) {
  const color =
    tone === "red" ? "bg-red" : tone === "gold" ? "bg-gold" : tone === "blue" ? "bg-blue" : "bg-primary";
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-soft", className)}>
      <div className={cn("h-full rounded-full", color)} style={{ width: `${Math.min(100, value)}%` }} />
    </div>
  );
}
