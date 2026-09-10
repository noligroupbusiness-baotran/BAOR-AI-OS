import { cn } from "@/lib/format";

// Thanh tiến độ 0–100. Chỉ một màu (jade); dưới 30% dùng amber để người quản lý chú ý.
export function ProgressBar({ value, label, className, muted }: { value: number; label?: string; className?: string; muted?: boolean }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={cn("min-w-0", className)}>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-ground-2" role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className={cn("h-full rounded-full", muted ? "bg-ink-3" : v < 30 ? "bg-amber" : "bg-jade")} style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}
