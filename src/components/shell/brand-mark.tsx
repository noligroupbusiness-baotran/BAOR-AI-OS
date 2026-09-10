import { cn } from "@/lib/format";

// Logo góc trái. Hai biến thể: chữ tối cho nền sáng, chữ sáng cho nền tối; CSS chọn theo chế độ màu
// (lớp only-light / only-dark trong globals.css). Nguồn: logo tải lên ở Cài đặt › Thương hiệu, không có thì
// dùng tệp mặc định trong public/brand, không có nữa thì hiện ô chữ B.
export interface BrandLogos {
  /** Chữ tối, dùng trên nền sáng. */
  light: string | null;
  /** Chữ sáng, dùng trên nền tối. */
  dark: string | null;
  /** Biểu tượng vuông khi thu gọn (tùy chọn). */
  markLight: string | null;
  markDark: string | null;
}

export function BrandMark({ logos, collapsed, className }: { logos: BrandLogos; collapsed?: boolean; className?: string }) {
  const light = collapsed ? logos.markLight ?? logos.light : logos.light;
  const dark = collapsed ? logos.markDark ?? logos.dark : logos.dark;
  if (!light && !dark) {
    return (
      <div className={cn("flex items-center gap-2.5", collapsed && "justify-center", className)}>
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-jade text-[14px] font-bold text-white">B</div>
        {!collapsed && (
          <div className="min-w-0 leading-tight">
            <div className="truncate text-[13px] font-bold text-ink">BAOR AI OS</div>
            <div className="truncate text-[11px] text-ink-2">Marketing Automation</div>
          </div>
        )}
      </div>
    );
  }
  const h = collapsed ? "h-8 w-8 object-contain" : "h-9 w-auto max-w-[180px] object-contain object-left";
  return (
    <div className={cn("flex min-w-0 items-center", collapsed && "justify-center", className)} title="BAOR AI OS">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {(light ?? dark) && <img src={light ?? dark ?? ""} alt="BAOR" className={cn(h, dark ? "only-light" : "")} />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {dark && light && <img src={dark} alt="" aria-hidden className={cn(h, "only-dark")} />}
    </div>
  );
}
