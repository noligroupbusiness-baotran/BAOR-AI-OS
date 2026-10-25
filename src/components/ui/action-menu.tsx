import { MoreHorizontal } from "lucide-react";
import type { ReactNode } from "react";

// Nút "⋯" gom thao tác phụ (OWNER 25/10/2026: "giao diện đơn giản, chuyên nghiệp, ít chữ, tương tác bằng nút bấm") — mỗi thẻ chỉ để
// lộ MỘT nút chính. Hộp xác nhận (Dialog) render qua portal nên mở được từ trong menu.
// align: menu mở về phía nào tính từ nút — "left" khi nút nằm sát mép trái (trang chi tiết), không thì menu tràn khỏi màn hình.
export function ActionMenu({ children, label = "Thao tác khác", align = "right" }: { children: ReactNode; label?: string; align?: "left" | "right" }) {
  return (
    <details className="group/menu relative">
      <summary
        aria-label={label}
        title={label}
        className="grid h-8 w-8 cursor-pointer list-none place-items-center rounded-full border border-border-2 text-ink-2 hover:border-ink-3 hover:text-ink focus-visible:outline-2 focus-visible:outline-jade [&::-webkit-details-marker]:hidden"
      >
        <MoreHorizontal size={16} aria-hidden />
      </summary>
      <div className={`absolute ${align === "left" ? "left-0" : "right-0"} z-30 mt-1.5 grid min-w-[200px] gap-1 rounded-lg border border-border bg-surface p-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.14)] [&_button]:w-full [&_button]:justify-start [&_a]:w-full`}>
        {children}
      </div>
    </details>
  );
}
