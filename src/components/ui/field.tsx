import { cn } from "@/lib/format";

// Lớp CSS dùng chung cho ô nhập / ô chọn, để mọi biểu mẫu cùng một kiểu.
export const inputClass = "h-8 w-full rounded-md border border-border-2 bg-surface px-2.5 text-[13px] text-ink outline-none placeholder:text-ink-3 focus-visible:outline-2 focus-visible:outline-jade disabled:opacity-60";
export const textareaClass = "w-full rounded-md border border-border-2 bg-surface px-2.5 py-2 text-[13px] leading-relaxed text-ink outline-none placeholder:text-ink-3 focus-visible:outline-2 focus-visible:outline-jade";

export function Field({ label, hint, required, className, children }: { label: string; hint?: string; required?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <label className={cn("block min-w-0", className)}>
      <span className="lbl flex items-center gap-1">
        {label}
        {required && <span className="text-brick" aria-hidden>*</span>}
      </span>
      <div className="mt-1">{children}</div>
      {hint && <span className="mt-1 block text-[11.5px] text-ink-3">{hint}</span>}
    </label>
  );
}

// Thông báo trong biểu mẫu: cảnh báo (amber) hoặc lỗi (brick).
export function FormNotice({ tone, children }: { tone: "warn" | "error" | "info"; children: React.ReactNode }) {
  const cls = tone === "error" ? "border-brick/40 bg-brick-soft text-brick" : tone === "warn" ? "border-amber/40 bg-amber-soft text-amber" : "border-border bg-ground-2 text-ink-2";
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("rounded-md border px-3 py-2 text-[12.5px] font-medium", cls)}>
      {children}
    </div>
  );
}
