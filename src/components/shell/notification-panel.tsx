"use client";

import Link from "next/link";
import { Drawer } from "@/components/ui/dialog";
import { Pill } from "@/components/ui/pill";
import { EmptyState } from "@/components/ui/empty-state";
import { notificationGroups, type NotificationGroup, type NotificationItem } from "@/lib/shell-types";
import { formatDateTime, cn } from "@/lib/format";

const groupTone: Record<NotificationGroup, "amber" | "sky" | "brick" | "neutral"> = { approval: "amber", due: "sky", error: "brick", activity: "neutral" };

// Thông báo tính từ dữ liệu thật (máy chủ); trạng thái đã đọc lưu ở trình duyệt theo id thông báo.
export function NotificationPanel({ open, onClose, items, readSet, onRead }: { open: boolean; onClose: () => void; items: NotificationItem[]; readSet: Set<string>; onRead: (ids: string[]) => void }) {
  const unread = items.filter((n) => !readSet.has(n.id)).length;
  return (
    <Drawer open={open} onClose={onClose} title="Trung tâm thông báo">
      <div className="flex items-center justify-between border-b border-border px-4 py-2 text-[12px] text-ink-2">
        <span>{unread} chưa đọc · tự cập nhật mỗi phút</span>
        <button type="button" onClick={() => onRead(items.map((n) => n.id))} className="cursor-pointer font-medium text-jade hover:underline">Đánh dấu đã đọc tất cả</button>
      </div>
      {notificationGroups.map((g) => {
        const list = items.filter((n) => n.group === g.key);
        return (
          <section key={g.key} className="border-b border-border last:border-b-0">
            <h3 className="px-4 pb-1 pt-3 text-[11.5px] font-semibold text-ink-3">{g.label} · {list.length}</h3>
            {list.length === 0 ? (
              <div className="px-4 pb-3 text-[12px] text-ink-3">Không có mục nào.</div>
            ) : (
              <ul className="m-0 list-none p-0">
                {list.map((n) => {
                  const isRead = readSet.has(n.id);
                  return (
                    <li key={n.id} className={cn("flex gap-3 px-4 py-2.5", !isRead && "bg-jade-soft/30")}>
                      <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", isRead ? "bg-transparent" : "bg-jade")} aria-label={isRead ? "Đã đọc" : "Chưa đọc"} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Pill tone={groupTone[n.group]}>{n.type}</Pill>
                          <span className="num text-[11px] text-ink-3">{formatDateTime(n.at)}</span>
                        </div>
                        <p className={cn("mt-1 text-[12.5px] leading-snug", isRead ? "text-ink-2" : "font-medium text-ink")}>{n.text}</p>
                        <Link href={n.href} onClick={() => { onRead([n.id]); onClose(); }} className="mt-1 inline-block text-[12px] font-medium text-jade hover:underline">
                          Xem chi tiết
                        </Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
      {items.length === 0 && <EmptyState title="Chưa có thông báo" />}
    </Drawer>
  );
}
