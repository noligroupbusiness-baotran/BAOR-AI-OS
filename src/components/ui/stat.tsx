import { cn } from "@/lib/format";

export function Tiles({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">{children}</div>;
}

export function Tile({ label, value, delta, hint, tone }: { label: string; value: string; delta?: string; hint?: string; tone?: "brick" | "amber" }) {
  const good = delta ? !delta.startsWith("▼") : true;
  return (
    <div className="card px-3.5 py-3">
      <div className="lbl">{label}</div>
      <div className={cn("num mt-1 flex items-baseline gap-2 text-[22px] font-bold tracking-[-0.02em]", tone === "brick" ? "text-brick" : tone === "amber" ? "text-amber" : "text-ink")}>
        {value}
        {delta && <span className={cn("text-[11.5px] font-semibold", good ? "text-jade" : "text-ink-2")}>{delta}</span>}
      </div>
      {hint && <div className="mt-0.5 text-[11.5px] text-ink-2">{hint}</div>}
    </div>
  );
}
