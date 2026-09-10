"use client";

import { useState } from "react";
import { Drawer } from "@/components/ui/dialog";
import { StatusPill } from "@/components/ui/status";
import { agentStatusLabel } from "@/lib/mock/dashboard";
import type { SystemStatus } from "@/lib/dashboard-data";
import { cn, formatDateTime } from "@/lib/format";

// Thanh tóm tắt tình trạng hệ thống (một dòng) + bảng trượt chi tiết Agent khi bấm "Xem chi tiết".
export function SystemStatusBar({ status }: { status: SystemStatus }) {
  const [open, setOpen] = useState(false);
  const dot = status.level === "error" ? "bg-brick" : status.level === "warn" ? "bg-amber" : "bg-jade";
  return (
    <>
      <div id="tinh-trang-he-thong" className="card mt-3.5 scroll-mt-20 flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5 text-[12.5px]">
        <span className={cn("live inline-block h-2 w-2 shrink-0 rounded-full", dot)} aria-hidden />
        <span className="font-semibold text-ink">Tình trạng hệ thống</span>
        <span className="text-ink-2">{status.summary}</span>
        <button type="button" onClick={() => setOpen(true)} className="ml-auto cursor-pointer font-medium text-jade hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jade">
          Xem chi tiết
        </button>
      </div>
      <Drawer open={open} onClose={() => setOpen(false)} title="Tình trạng hệ thống" width={440}>
        <div className="border-b border-border px-4 py-3 text-[12.5px] text-ink-2">
          <span className={cn("mr-2 inline-block h-2 w-2 rounded-full align-middle", dot)} aria-hidden />
          {status.summary}
        </div>
        <h3 className="px-4 pt-3 text-[11.5px] font-semibold uppercase tracking-wide text-ink-3">AI Agent</h3>
        <ul className="m-0 list-none p-0">
          {status.agents.map((ag) => {
            const st = agentStatusLabel[ag.status];
            return (
              <li key={ag.id} className="flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-ink">{ag.name}</div>
                  <div className="truncate text-[12px] text-ink-2">{ag.task}</div>
                  <div className="num mt-0.5 text-[11px] text-ink-3">Cập nhật {formatDateTime(ag.updatedAt)}</div>
                </div>
                <StatusPill status={ag.status === "active" ? "active" : ag.status === "needs_approval" ? "pending" : ag.status === "error" ? "error" : "disabled"} label={st.label} />
              </li>
            );
          })}
        </ul>
        <h3 className="px-4 pt-4 text-[11.5px] font-semibold uppercase tracking-wide text-ink-3">Lỗi đang có</h3>
        {status.issues.length === 0 ? (
          <p className="px-4 py-3 text-[12.5px] text-ink-2">Không có lỗi nào.</p>
        ) : (
          <ul className="m-0 list-none p-0">
            {status.issues.map((s, i) => (
              <li key={i} className="border-b border-border px-4 py-2.5 text-[12.5px] text-ink last:border-b-0">{s}</li>
            ))}
          </ul>
        )}
        <p className="px-4 py-4 text-[12px] text-ink-3">Agent chỉ chuẩn bị và đề xuất. Mọi việc xuất bản đều chờ anh phê duyệt.</p>
      </Drawer>
    </>
  );
}
