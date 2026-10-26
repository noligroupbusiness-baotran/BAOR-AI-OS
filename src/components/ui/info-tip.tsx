import { useId } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/format";

// Nút (i) mở phần giải thích (Popover API: nằm ở lớp trên cùng nên không bị khung thẻ cắt, bấm ra ngoài / Esc để đóng).
// Dùng thay cho đoạn văn dài trong Cài đặt (OWNER 26/10/2026: "ít text, tối ưu bằng nút bấm").
export function InfoTip({ children, label = "Giải thích", className }: { children: React.ReactNode; label?: string; className?: string }) {
  const id = `tip-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <>
      <button
        type="button"
        popoverTarget={id}
        aria-label={label}
        title={label}
        className={cn("inline-grid h-5 w-5 shrink-0 cursor-pointer place-items-center rounded-full text-ink-3 transition-colors hover:bg-ground-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-jade", className)}
      >
        <Info size={14} aria-hidden />
      </button>
      <div id={id} popover="auto" className="info-pop">
        {children}
      </div>
    </>
  );
}
