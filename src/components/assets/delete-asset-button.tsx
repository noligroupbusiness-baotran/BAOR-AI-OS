"use client";

import { useState } from "react";
import { Trash2, Undo2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/campaigns/submit-button";
import { cn } from "@/lib/format";

// Nút xoá tư liệu (OWNER 26/10/2026): biểu tượng thùng rác nhỏ — máy có chuột: hiện khi rê vào ô (ô có lớp `group`) hoặc khi
// chọn bằng bàn phím; màn hình cảm ứng: luôn hiện. Bấm → hộp xác nhận nêu đúng tên tệp → gửi server action kèm các trường ẩn.
export function DeleteAssetButton({ action, fields, name, note = "Chuyển vào Đã xoá, khôi phục được trong 30 ngày.", className, overlay, always }: { action: (fd: FormData) => Promise<void>; fields: Record<string, string>; name: string; note?: string; className?: string; overlay?: boolean; always?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Xoá"
        title={`Xoá “${name}”`}
        className={cn(
          "grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-full transition-opacity focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-jade",
          !always && "[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100",
          overlay ? "bg-black/55 text-white hover:bg-brick" : "text-ink-3 hover:bg-brick-soft hover:text-brick",
          className,
        )}
      >
        <Trash2 size={13} aria-hidden />
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Xoá tư liệu?"
        top
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Huỷ</Button>
            <form action={action}>
              {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
              <SubmitButton variant="outline" pendingText="Đang xoá…" className="border-brick text-brick">Xoá</SubmitButton>
            </form>
          </>
        }
      >
        <p className="m-0 break-all font-medium text-ink">{name}</p>
        <p className="m-0 mt-1.5">{note}</p>
      </Dialog>
    </>
  );
}

/** Ghi chú trong hộp xác nhận khi xoá tư liệu "Máy của anh" (máy dựng xoá trên Mac ở lần đồng bộ kế). */
export const OWNER_MAC_TRASH_NOTE = "Máy dựng chuyển tệp vào Đã xoá trên máy của anh, khôi phục được 30 ngày tại máy.";

/** Huỷ lệnh xoá tư liệu "Máy của anh" chưa được máy dựng áp (luôn hiện — trạng thái chờ phải thấy được). */
export function CancelTrashButton({ action, id, name, overlay }: { action: (fd: FormData) => Promise<void>; id: string; name: string; overlay?: boolean }) {
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="cancel" value="1" />
      {overlay ? (
        <button type="submit" aria-label={`Huỷ xoá “${name}”`} title="Huỷ xoá" className="grid h-7 w-7 cursor-pointer place-items-center rounded-full bg-black/55 text-white hover:bg-jade focus-visible:outline-2 focus-visible:outline-jade">
          <Undo2 size={13} aria-hidden />
        </button>
      ) : (
        <SubmitButton variant="ghost" pendingText="Đang huỷ…" title={`Huỷ xoá “${name}”`}><Undo2 size={13} aria-hidden />Huỷ xoá</SubmitButton>
      )}
    </form>
  );
}
