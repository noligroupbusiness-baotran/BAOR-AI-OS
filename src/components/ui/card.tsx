import { cn } from "@/lib/format";

export function Card({
  children,
  className,
  padded = true,
  id,
}: {
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
  id?: string;
}) {
  return (
    <div
      id={id}
      className={cn(
        "rounded-[var(--radius)] border border-border bg-surface shadow-[0_1px_2px_rgba(30,30,20,0.04)]",
        padded && "p-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  icon,
  action,
  tone,
}: {
  title: string;
  subtitle?: string;
  icon?: string;
  action?: React.ReactNode;
  tone?: "green" | "red" | "gold" | "blue" | "purple" | "neutral";
}) {
  const color =
    tone === "red"
      ? "text-red"
      : tone === "gold"
        ? "text-gold"
        : tone === "blue"
          ? "text-blue"
          : tone === "purple"
            ? "text-purple"
            : tone === "green"
              ? "text-primary-text"
              : "text-ink";
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className={cn("text-[12.5px] font-bold uppercase tracking-wide", color)}>
          {icon && <span className="mr-1.5">{icon}</span>}
          {title}
        </h3>
        {subtitle && <p className="mt-0.5 text-[12px] text-muted">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function SectionLabel({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "red" | "green" | "gold" | "blue" | "purple";
  className?: string;
}) {
  const color =
    tone === "red"
      ? "text-red"
      : tone === "green"
        ? "text-primary-text"
        : tone === "gold"
          ? "text-gold"
          : tone === "blue"
            ? "text-blue"
            : tone === "purple"
              ? "text-purple"
              : "text-faint";
  return (
    <div className={cn("text-[11px] font-bold uppercase tracking-wider", color, className)}>
      {children}
    </div>
  );
}
