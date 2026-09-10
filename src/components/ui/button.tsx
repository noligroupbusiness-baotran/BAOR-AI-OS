import Link from "next/link";
import { cn } from "@/lib/format";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "soft";
type Size = "xs" | "sm" | "md";

const variantClass: Record<Variant, string> = {
  primary:
    "bg-primary text-white hover:bg-primary-strong shadow-[0_1px_0_rgba(0,0,0,0.06)] border border-primary-strong/40",
  secondary: "bg-surface text-ink border border-border-strong hover:bg-surface-soft",
  ghost: "bg-transparent text-muted hover:bg-surface-soft hover:text-ink",
  danger: "bg-red-soft text-red border border-red/20 hover:bg-red/15",
  soft: "bg-primary-soft text-primary-text hover:bg-primary/20 border border-primary/10",
};

const sizeClass: Record<Size, string> = {
  xs: "h-6 px-2 text-[11px] gap-1",
  sm: "h-7 px-2.5 text-[12px] gap-1.5",
  md: "h-8.5 px-3.5 text-[13px] gap-2",
};

interface BaseProps {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: React.ReactNode;
}

export function Button({
  variant = "secondary",
  size = "sm",
  className,
  children,
  ...rest
}: BaseProps & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-full font-medium whitespace-nowrap transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer",
        variantClass[variant],
        sizeClass[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  variant = "secondary",
  size = "sm",
  className,
  children,
}: BaseProps & { href: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center justify-center rounded-full font-medium whitespace-nowrap transition-colors",
        variantClass[variant],
        sizeClass[size],
        className,
      )}
    >
      {children}
    </Link>
  );
}
