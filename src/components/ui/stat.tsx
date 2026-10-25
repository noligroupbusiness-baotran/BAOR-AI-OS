import { cn } from "@/lib/format";
import { CountUp } from "./count-up";
import { SampleLine } from "./sample";

export function Tiles({ children }: { children: React.ReactNode }) {
  return <div className="stagger grid grid-cols-2 gap-2.5 md:grid-cols-4">{children}</div>;
}

/** sample: phần số liệu MẪU (không cộng vào value), hiện riêng với nhãn "Mẫu". */
export function Tile({ label, value, delta, hint, tone, sample }: { label: string; value: string; delta?: string; hint?: string; tone?: "brick" | "amber"; sample?: string }) {
  const good = delta ? !delta.startsWith("▼") : true;
  return (
    <div className="card appear appear--stat px-3.5 py-3">
      <div className="lbl">{label}</div>
      <div className={cn("num mt-1 flex items-baseline gap-2 text-[22px] font-bold tracking-[-0.02em]", tone === "brick" ? "text-brick" : tone === "amber" ? "text-amber" : "text-ink")}>
        <CountUp value={value} />
        {delta && <span className={cn("text-[11.5px] font-semibold", good ? "text-jade" : "text-ink-2")}>{delta}</span>}
      </div>
      {hint && <div className="mt-0.5 text-[11.5px] text-ink-2">{hint}</div>}
      {sample && <div className="mt-1"><SampleLine>{sample}</SampleLine></div>}
    </div>
  );
}
