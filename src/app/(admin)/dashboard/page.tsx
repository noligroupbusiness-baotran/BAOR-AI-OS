import Link from "next/link";
import { AlertTriangle, CalendarClock, ListChecks, UserPlus } from "lucide-react";
import { Panel, PanelHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { EmptyState } from "@/components/ui/empty-state";
import { PendingRow } from "@/components/dashboard/pending-row";
import { PendingAllButton } from "@/components/dashboard/pending-all";
import { SystemStatusBar } from "@/components/dashboard/system-status";
import { getOverview, getPending, getSystemStatus, getTodaySchedule } from "@/lib/dashboard-data";
import { timelineStatusLabel } from "@/lib/mock/dashboard";
import { formatDate, cn } from "@/lib/format";

export const metadata = { title: "Điều hành – BAOR AI OS" };

const weekdays = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];

export default function DashboardPage() {
  const now = new Date();
  const vnDay = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Ho_Chi_Minh", weekday: "short" }).format(now);
  const weekday = weekdays[["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(vnDay)] ?? "";
  const stats = getOverview();
  const pending = getPending();
  const top = pending.slice(0, 5);
  const schedule = getTodaySchedule(5);
  const system = getSystemStatus(stats.pendingApproval);

  // 4 chỉ số quan trọng. Màu trạng thái chỉ khi có việc cần chú ý.
  const tiles: { label: string; value: number; icon: typeof ListChecks; href: string; tone?: "amber" | "brick" }[] = [
    { label: "Chờ tôi duyệt", value: stats.pendingApproval, icon: ListChecks, href: "#cho-toi-xu-ly", tone: stats.pendingApproval ? "amber" : undefined },
    { label: "Lịch đăng hôm nay", value: stats.postsToday, icon: CalendarClock, href: "/publishing" },
    { label: "Lead mới hôm nay", value: stats.leadsToday, icon: UserPlus, href: "/customers?tab=leads" },
    { label: "Cảnh báo", value: stats.alerts, icon: AlertTriangle, href: "#cho-toi-xu-ly", tone: stats.alerts ? "brick" : undefined },
  ];

  return (
    <>
      <div className="mb-3.5">
        <h1 className="text-[20px] font-bold tracking-[-0.01em] text-ink">Điều hành</h1>
        <p className="mt-0.5 text-[12.5px] text-ink-2">{weekday}, {formatDate(now.toISOString())}</p>
      </div>

      {/* 1. Bốn chỉ số quan trọng */}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {tiles.map((t) => {
          const Icon = t.icon;
          return (
            <Link key={t.label} href={t.href} className="card flex items-center justify-between gap-2 px-3.5 py-2.5 transition-colors hover:border-ink-3 hover:bg-ground-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jade">
              <div className="min-w-0">
                <div className="truncate text-[12px] font-medium text-ink-2">{t.label}</div>
                <div className={cn("num text-[22px] font-bold leading-tight tracking-[-0.02em]", t.tone === "brick" ? "text-brick" : t.tone === "amber" ? "text-amber" : "text-ink")}>{t.value}</div>
              </div>
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-ground-2 text-ink-2"><Icon size={14} aria-hidden /></span>
            </Link>
          );
        })}
      </div>

      <div className="grid gap-3.5 lg:grid-cols-[2fr_1fr] lg:items-start">
        {/* 2. Chờ tôi xử lý: tối đa 5 việc ưu tiên nhất */}
        <Panel id="cho-toi-xu-ly">
          <PanelHeader title="Chờ tôi xử lý" sub={pending.length ? `${Math.min(5, pending.length)} việc ưu tiên nhất trong ${pending.length} việc.` : "Không có việc nào."} />
          {top.length === 0 ? (
            <EmptyState title="Hiện không có việc nào chờ anh xử lý" hint="Khi Agent gửi nội dung, video, lịch đăng hoặc gặp lỗi, mục đó sẽ hiện ở đây." />
          ) : (
            <>
              <ul className="m-0 list-none p-0">
                {top.map((it) => (
                  <PendingRow key={it.id} item={it} />
                ))}
              </ul>
              <PendingAllButton items={pending} />
            </>
          )}
        </Panel>

        {/* 3. Hôm nay: tối đa 5 hoạt động gần nhất */}
        <Panel>
          <PanelHeader title="Hôm nay" sub="Hoạt động gần nhất hoặc sắp diễn ra." />
          {schedule.length === 0 ? (
            <EmptyState title="Hôm nay chưa có lịch" />
          ) : (
            <ol className="m-0 list-none p-0">
              {schedule.map((t) => (
                <li key={t.id} className={cn("flex gap-3 border-b border-border px-4 py-2.5 last:border-b-0", t.status === "needs_confirm" && "bg-amber-soft/40")}>
                  <span className={cn("num w-10 shrink-0 pt-px text-[12.5px] font-semibold", t.status === "done" ? "text-ink-3" : "text-ink")}>{t.time}</span>
                  <div className="min-w-0 flex-1">
                    <div className={cn("line-clamp-2 text-[13px]", t.status === "done" ? "text-ink-2" : "text-ink")}>{t.title}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11.5px] text-ink-2">
                      <span className="truncate">{t.platform}</span>
                      {t.status === "needs_confirm" ? (
                        <Pill tone="amber" className="h-[18px] px-1.5 text-[10.5px]">{timelineStatusLabel[t.status]}</Pill>
                      ) : (
                        <span className="text-ink-3">{timelineStatusLabel[t.status]}</span>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
          <Link href="/publishing" className="flex items-center justify-center border-t border-border px-4 py-2.5 text-[12.5px] font-medium text-jade hover:bg-ground-2 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-jade">
            Xem toàn bộ lịch
          </Link>
        </Panel>
      </div>

      {/* 4. Thanh tóm tắt tình trạng hệ thống */}
      <SystemStatusBar status={system} />
    </>
  );
}
