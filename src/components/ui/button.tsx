import Link from "next/link";
import { cn } from "@/lib/format";

type Variant = "primary" | "outline" | "soft" | "ghost";
type Size = "sm" | "md";

// Nút "liquid glass" (OWNER 25/10/2026): chính = kim loại (sáng: graphite, tối: trắng bạc), phụ = kính viền bạc;
// cả hai có vệt sáng quét khi rê chuột (.btn::after, globals.css). Bo 6 px; md cao 40 px.
const variantClass: Record<Variant, string> = {
  primary: "btn-primary",
  outline: "btn-glass",
  soft: "bg-jade-soft border-transparent text-jade-ink hover:bg-jade/20",
  ghost: "bg-transparent border-transparent text-ink-2 hover:bg-ground-2 hover:text-ink",
};
const sizeClass: Record<Size, string> = {
  sm: "h-7 px-2.5 text-[12px]",
  md: "h-10 px-3.5 text-[12.5px]",
};
const base =
  "btn inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jade disabled:cursor-not-allowed disabled:opacity-50";

export function Button({
  variant = "outline",
  size = "sm",
  className,
  children,
  ...rest
}: { variant?: Variant; size?: Size; className?: string; children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={cn(base, variantClass[variant], sizeClass[size], className)} {...rest}>
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  variant = "outline",
  size = "sm",
  className,
  children,
}: { href: string; variant?: Variant; size?: Size; className?: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={cn(base, variantClass[variant], sizeClass[size], className)}>
      {children}
    </Link>
  );
}
