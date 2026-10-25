"use client";

import { useCallback, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

function useMounted() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

// Khung "Lên lịch đăng" mở ngay trên Kho video (?schedule=<id>): nội dung là biểu mẫu dựng ở máy chủ; đóng = bỏ tham số khỏi địa chỉ.
export function ScheduleDialog({ title, closeHref, children }: { title: string; closeHref: string; children: ReactNode }) {
  const router = useRouter();
  const mounted = useMounted();
  const close = useCallback(() => router.replace(closeHref, { scroll: false }), [router, closeHref]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !document.querySelector('[aria-labelledby="dlg-title"]') && close();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [close]);
  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-[65] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div role="dialog" aria-modal="true" aria-labelledby="schedule-title" className="card max-h-[92dvh] w-full max-w-[520px] overflow-y-auto rounded-b-none p-4 sm:rounded-b-[var(--radius)]">
        <div className="mb-2 flex items-start justify-between gap-3">
          <h2 id="schedule-title" className="m-0 min-w-0 text-[14px] font-bold text-ink [overflow-wrap:anywhere]">{title}</h2>
          <button type="button" onClick={close} aria-label="Đóng" className="grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-full text-ink-2 hover:bg-ground-2 hover:text-ink">
            <X size={16} aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
