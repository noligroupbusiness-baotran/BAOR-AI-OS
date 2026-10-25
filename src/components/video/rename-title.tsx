"use client";

import { useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { renameVideoAction } from "@/lib/actions/videos";
import { SubmitButton } from "@/components/campaigns/submit-button";

// Tên video ở trang chi tiết (tiêu đề trang). OWNER 25/10/2026 "chỗ đổi tên khó nhìn thấy quá": nút viền có chữ "✎ Đổi tên" ngay cạnh tên,
// rê chuột lên tên cũng hiện gạch chân + con trỏ sửa; bấm → ô nhập to, chọn sẵn cả tên, Enter lưu / Esc huỷ.
export function RenameTitle({ id, title, back, initialOpen }: { id: string; title: string; back: string; initialOpen?: boolean }) {
  const [editing, setEditing] = useState(!!initialOpen);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!editing) return;
    input.current?.focus();
    input.current?.select();
  }, [editing]);

  if (!editing) {
    return (
      <div className="flex items-start gap-2">
        <h1 className="m-0 min-w-0 flex-1 text-[16px] font-bold leading-snug text-ink [overflow-wrap:anywhere]">
          <span role="button" tabIndex={-1} onClick={() => setEditing(true)} title="Bấm để đổi tên" className="cursor-text decoration-ink-3 decoration-dashed underline-offset-4 hover:underline">
            {title}
          </span>
        </h1>
        <button type="button" onClick={() => setEditing(true)} className="inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-full border border-border-2 bg-surface px-2.5 text-[12px] font-medium text-ink hover:border-jade hover:text-jade focus-visible:outline-2 focus-visible:outline-jade">
          <Pencil size={12} aria-hidden /> Đổi tên
        </button>
      </div>
    );
  }
  return (
    <form action={renameVideoAction} aria-label="Đổi tên video" className="grid gap-2" onKeyDown={(e) => e.key === "Escape" && setEditing(false)}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="back" value={back} />
      <input ref={input} name="title" defaultValue={title} required maxLength={120} aria-label="Tên video" className="h-10 w-full rounded-md border border-jade bg-surface px-3 text-[15px] font-semibold text-ink outline-none focus-visible:outline-2 focus-visible:outline-jade" />
      <div className="flex items-center gap-1.5">
        <SubmitButton variant="primary" size="md" pendingText="Đang lưu…">Lưu tên</SubmitButton>
        <button type="button" onClick={() => setEditing(false)} className="h-8 cursor-pointer rounded-full px-3 text-[12.5px] text-ink-2 hover:text-ink">Huỷ</button>
        <span className="ml-auto text-[11px] text-ink-3">Enter lưu · Esc huỷ</span>
      </div>
    </form>
  );
}
