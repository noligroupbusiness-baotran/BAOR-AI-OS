"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Drawer } from "@/components/ui/dialog";
import { PendingRow } from "@/components/dashboard/pending-row";
import type { PendingItem } from "@/lib/dashboard-data";

// Nút "Xem tất cả" ở cuối danh sách, mở bảng trượt liệt kê toàn bộ việc chờ.
export function PendingAllButton({ items }: { items: PendingItem[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full cursor-pointer items-center justify-center gap-1 border-t border-border px-4 py-2.5 text-[12.5px] font-medium text-jade hover:bg-ground-2 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-jade"
      >
        Xem tất cả ({items.length}) <ChevronRight size={14} aria-hidden />
      </button>
      <Drawer open={open} onClose={() => setOpen(false)} title={`Tất cả việc chờ xử lý (${items.length})`} width={480}>
        <ul className="m-0 list-none p-0">
          {items.map((it) => (
            <PendingRow key={it.id} item={it} compact />
          ))}
        </ul>
      </Drawer>
    </>
  );
}
