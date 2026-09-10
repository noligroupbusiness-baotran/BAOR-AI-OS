import { cn } from "@/lib/format";

export type Tone =
  | "green"
  | "gold"
  | "blue"
  | "purple"
  | "red"
  | "orange"
  | "teal"
  | "slate"
  | "neutral";

const toneClass: Record<Tone, string> = {
  green: "bg-primary-soft text-primary-text",
  gold: "bg-gold-soft text-gold",
  blue: "bg-blue-soft text-blue",
  purple: "bg-purple-soft text-purple",
  red: "bg-red-soft text-red",
  orange: "bg-orange-soft text-orange",
  teal: "bg-teal-soft text-teal",
  slate: "bg-slate-soft text-slate",
  neutral: "bg-surface-soft text-muted",
};

export function Pill({
  tone = "neutral",
  children,
  className,
  size = "sm",
}: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
  size?: "xs" | "sm";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap",
        size === "xs" ? "px-1.5 py-[1px] text-[10.5px]" : "px-2 py-[2px] text-[11.5px]",
        toneClass[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function ScoreBadge({ score }: { score: number }) {
  const tone: Tone = score >= 85 ? "green" : score >= 70 ? "gold" : "slate";
  return (
    <Pill tone={tone} className="font-semibold tabular-nums">
      <span aria-hidden>★</span> {score}
    </Pill>
  );
}

export function Dot({ tone = "green", live }: { tone?: Tone; live?: boolean }) {
  const color: Record<Tone, string> = {
    green: "bg-primary",
    gold: "bg-gold",
    blue: "bg-blue",
    purple: "bg-purple",
    red: "bg-red",
    orange: "bg-orange",
    teal: "bg-teal",
    slate: "bg-slate",
    neutral: "bg-faint",
  };
  return (
    <span
      className={cn("inline-block h-2 w-2 rounded-full", color[tone], live && "dot-live")}
    />
  );
}
