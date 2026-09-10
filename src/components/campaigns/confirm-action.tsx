"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "./submit-button";

// Nút hành động cần xác nhận: bấm → hộp thoại → xác nhận mới gửi lên máy chủ.
// Dùng cho phê duyệt, kích hoạt, tạm dừng, kết thúc — những việc không nên lỡ tay.
export function ConfirmAction({
  action,
  fields,
  label,
  title,
  message,
  confirmLabel,
  variant = "outline",
  size = "sm",
  danger,
  withNote,
}: {
  action: (fd: FormData) => Promise<void>;
  fields: Record<string, string>;
  label: string;
  title: string;
  message: string;
  confirmLabel?: string;
  variant?: "primary" | "outline" | "soft" | "ghost";
  size?: "sm" | "md";
  danger?: boolean;
  /** Cho phép ghi chú kèm quyết định (VD: lý do yêu cầu chỉnh sửa). */
  withNote?: { label: string; placeholder?: string; required?: boolean };
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant={variant} size={size} onClick={() => setOpen(true)} className={danger ? "text-brick hover:border-brick" : undefined}>
        {label}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={title}>
        <form action={action} className="grid gap-3">
          {Object.entries(fields).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <p>{message}</p>
          {withNote && (
            <label className="block">
              <span className="lbl">{withNote.label}</span>
              <textarea name="note" rows={3} required={withNote.required} placeholder={withNote.placeholder} className="mt-1 w-full rounded-md border border-border-2 bg-surface px-2.5 py-2 text-[13px] text-ink outline-none focus-visible:outline-2 focus-visible:outline-jade" />
            </label>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <SubmitButton variant={danger ? "outline" : "primary"} className={danger ? "border-brick text-brick hover:bg-brick-soft" : undefined}>
              {confirmLabel ?? label}
            </SubmitButton>
          </div>
        </form>
      </Dialog>
    </>
  );
}
