import { cn } from "@/lib/format";

// Logo góc trái: chữ BAOR (ảnh, hai biến thể theo nền) + nhãn "AI OS" và dòng phụ bằng chữ giao diện.
// Lớp only-light / only-dark (globals.css) chọn biến thể theo chế độ màu. Không có ảnh thì hiện ô chữ B.
export interface BrandLogos {
  /** Chữ tối, dùng trên nền sáng. */
  light: string | null;
  /** Chữ sáng, dùng trên nền tối. */
  dark: string | null;
  markLight: string | null;
  markDark: string | null;
}

function Pair({ light, dark, className, alt }: { light: string | null; dark: string | null; className: string; alt: string }) {
  const a = light ?? dark;
  const b = dark ?? light;
  if (!a) return null;
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={a} alt={alt} className={cn(className, b !== a && "only-light")} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {b !== a && <img src={b!} alt="" aria-hidden className={cn(className, "only-dark")} />}
    </>
  );
}

export function BrandMark({ logos, collapsed, className }: { logos: BrandLogos; collapsed?: boolean; className?: string }) {
  if (collapsed) {
    return (
      <div className={cn("flex justify-center", className)} title="BAOR AI OS">
        {logos.markLight || logos.markDark ? <Pair light={logos.markLight} dark={logos.markDark} className="h-8 w-8 rounded-lg object-contain" alt="BAOR" /> : <div className="grid h-8 w-8 place-items-center rounded-lg bg-jade text-[14px] font-bold text-white">B</div>}
      </div>
    );
  }
  if (!logos.light && !logos.dark) {
    return (
      <div className={cn("flex items-center gap-2.5", className)}>
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-jade text-[14px] font-bold text-white">B</div>
        <div className="min-w-0 leading-tight">
          <div className="truncate text-[13px] font-bold text-ink">BAOR AI OS</div>
          <div className="truncate text-[11px] text-ink-2">Marketing Automation</div>
        </div>
      </div>
    );
  }
  return (
    <div className={cn("flex min-w-0 flex-col gap-[3px]", className)} title="BAOR AI OS">
      <div className="flex items-end gap-2">
        <Pair light={logos.light} dark={logos.dark} className="h-[22px] w-auto max-w-[128px] object-contain object-left" alt="BAOR" />
        <span className="rounded-[5px] border border-border-2 px-1.5 text-[10px] font-bold leading-[16px] tracking-[0.12em] text-ink">AI OS</span>
      </div>
      <div className="truncate text-[9.5px] font-semibold uppercase tracking-[0.18em] text-ink-3">Marketing Automation</div>
    </div>
  );
}
