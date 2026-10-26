import Link from "next/link";
import { LoaderCircle, type LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/format";

// Hệ nút bấm (OWNER 27/10/2026: "làm các nút bấm đẹp hơn"). Toàn bộ hình khối + màu ở globals.css (.btn, .btn-*, token --btn-*),
// ở lớp components nên className riêng từng nơi vẫn đè được màu / padding / cỡ chữ / chiều cao. Thứ bậc: primary › outline › soft › ghost;
// danger cho thao tác phá huỷ. Bo 8 px; sm cao 32 px, md 40 px; size="icon" = ô vuông 32 px, bắt buộc có aria-label (kiểu dữ liệu ép).
// CỐ Ý: .btn có sàn min-height 32 px (vùng bấm) — h-6/h-7 truyền vào chỉ làm nút CAO hơn, không thấp hơn 32 px.
// Nơi thật sự cần nút thấp hơn phải ghi rõ thêm "min-h-0" (tiện ích thắng lớp components).
export type ButtonVariant = "primary" | "outline" | "soft" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "icon";

const variantClass: Record<ButtonVariant, string> = {
  primary: "btn-primary",
  outline: "btn-glass",
  soft: "btn-soft",
  ghost: "btn-ghost",
  danger: "btn-danger",
};
const sizeClass: Record<ButtonSize, string> = {
  sm: "btn-sm",
  md: "btn-md",
  icon: "btn-icon",
};
const iconPx: Record<ButtonSize, number> = { sm: 14, md: 16, icon: 16 };

const base = "btn inline-flex cursor-pointer items-center justify-center whitespace-nowrap";

/** Class của nút cho phần tử không phải <button>/<Link> (VD: <summary>, <label>) để trông giống hệt nút. */
export function buttonClass(variant: ButtonVariant = "outline", size: ButtonSize = "sm", className?: string): string {
  return cn(base, variantClass[variant], sizeClass[size], className);
}

/** Nút chỉ có icon phải có tên đọc được cho trình đọc màn hình / E2E. */
type SizeProps = { size?: "sm" | "md"; children: ReactNode } | { size: "icon"; "aria-label": string; children?: ReactNode };

type CommonProps = {
  variant?: ButtonVariant;
  className?: string;
  /** Icon lucide đầu dòng (tự canh cỡ theo size, aria-hidden). */
  icon?: LucideIcon;
};

function Content({ icon: Icon, size, loading, children }: { icon?: LucideIcon; size: ButtonSize; loading?: boolean; children?: ReactNode }) {
  const px = iconPx[size];
  const lead = loading ? (
    <LoaderCircle size={px} aria-hidden className="btn-lead motion-safe:animate-spin" />
  ) : Icon ? (
    <Icon size={px} aria-hidden className="btn-lead" />
  ) : null;
  // Nút icon đang chờ: chỉ hiện vòng xoay thay cho icon cũ
  if (size === "icon" && loading) return lead;
  return (
    <>
      {lead}
      {children}
    </>
  );
}

export function Button({
  variant = "outline",
  size = "sm",
  icon,
  loading,
  className,
  children,
  disabled,
  ...rest
}: CommonProps & SizeProps & { loading?: boolean } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "className">) {
  return (
    <button className={buttonClass(variant, size, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      <Content icon={icon} size={size} loading={loading}>
        {children}
      </Content>
    </button>
  );
}

export function LinkButton({
  href,
  variant = "outline",
  size = "sm",
  icon,
  className,
  children,
  ...rest
}: CommonProps & SizeProps & { href: string; title?: string }) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)} {...rest}>
      <Content icon={icon} size={size}>
        {children}
      </Content>
    </Link>
  );
}
