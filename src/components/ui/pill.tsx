import { cn } from "@/lib/format";

export type Tone = "jade" | "amber" | "brick" | "violet" | "sky" | "neutral";

const toneClass: Record<Tone, string> = {
  jade: "bg-jade-soft text-jade-ink",
  amber: "bg-amber-soft text-amber",
  brick: "bg-brick-soft text-brick",
  violet: "bg-violet-soft text-violet",
  sky: "bg-sky-soft text-sky",
  neutral: "bg-ground-2 text-ink-2",
};

export function Pill({ tone = "neutral", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1.5 whitespace-nowrap rounded-full px-2 text-[11px] font-semibold",
        toneClass[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Score({ value }: { value: number }) {
  return (
    <Pill tone={value >= 85 ? "jade" : value >= 70 ? "amber" : "neutral"} className="num min-w-[40px] justify-center">
      ★ {value}
    </Pill>
  );
}
