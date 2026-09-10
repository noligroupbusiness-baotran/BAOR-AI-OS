import { Inbox } from "lucide-react";

// Trạng thái không có dữ liệu, dùng cho mọi danh sách và trang khung.
export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
      <div className="grid h-10 w-10 place-items-center rounded-full bg-ground-2 text-ink-3">
        <Inbox size={18} aria-hidden />
      </div>
      <div className="text-[13px] font-semibold text-ink">{title}</div>
      {hint && <p className="max-w-[40ch] text-[12.5px] text-ink-2">{hint}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
