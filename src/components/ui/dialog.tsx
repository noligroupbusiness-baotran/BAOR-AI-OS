"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/format";

// Chỉ render portal sau khi đã gắn vào DOM (tránh lỗi khi render phía máy chủ).
function useMounted() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

// Hộp thoại đơn giản, đóng bằng Esc hoặc bấm nền, có nhãn trợ năng.
export function Dialog({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const mounted = useMounted();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    ref.current?.querySelector<HTMLElement>("button, [href], input, textarea")?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open || !mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="dlg-title" className={cn("card w-full max-w-[420px] p-5")}>
        <div className="flex items-start justify-between gap-3">
          <h2 id="dlg-title" className="text-[14px] font-bold text-ink">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Đóng" className="grid h-7 w-7 cursor-pointer place-items-center rounded-full text-ink-2 hover:bg-ground-2 hover:text-ink">
            <X size={16} />
          </button>
        </div>
        <div className="mt-2 text-[13px] text-ink-2">{children}</div>
        {footer && <div className="mt-4 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

// Bảng trượt bên phải (thông báo, trợ lý AI).
export function Drawer({ open, onClose, title, children, width = 400 }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; width?: number }) {
  const mounted = useMounted();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!mounted) return null;
  return createPortal(
    <>
      {open && <div className="fixed inset-0 z-[60] bg-black/30 md:bg-transparent" onClick={onClose} aria-hidden />}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-hidden={!open}
        style={{ width: `min(${width}px, 100vw)` }}
        className={cn(
          "fixed inset-y-0 right-0 z-[65] flex flex-col border-l border-border bg-surface shadow-[0_0_30px_rgba(0,0,0,0.12)] transition-transform duration-200",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-[14px] font-bold text-ink">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Đóng bảng" className="grid h-7 w-7 cursor-pointer place-items-center rounded-full text-ink-2 hover:bg-ground-2 hover:text-ink">
            <X size={16} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </aside>
    </>,
    document.body,
  );
}
