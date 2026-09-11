import Link from "next/link";
import { AlertTriangle, CalendarClock, ListChecks, UserPlus } from "lucide-react";
import { Panel, PanelHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { EmptyState } from "@/components/ui/empty-state";
import { PendingRow } from "@/components/dashboard/pending-row";
import { PendingAllButton } from "@/components/dashboard/pending-all";
import { SystemStatusBar } from "@/components/dashboard/system-status";
import { getOverview, getPending, getSystemStatus, getTodaySchedule, timelineStatusLabel } from "@/lib/dashboard-data";
import { formatDate, formatDateTime, formatCurrency, cn } from "@/lib/format";
import { campaignRows, costSummary, leadSummary, orderSummary } from "@/lib/reports/data";
import { listActivity } from "@/lib/queries";
import { timingLabel } from "@/lib/campaigns/results";
import { CampaignStatusPill } from "@/components/campaigns/status";
import { ProgressBar } from "@/components/ui/progress";

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

  // Kết quả tháng này và chiến dịch đang chạy: cùng nguồn với Báo cáo, để Điều hành và Báo cáo không lệch nhau.
  const month = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" }).format(now).slice(0, 7);
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" }).format(now);
  const cost = costSummary({ month });
  const leads = leadSummary({ month });
  const orders = orderSummary({ month });
  const roas = cost.spent > 0 ? Math.round((cost.revenue / cost.spent) * 10) / 10 : null;
  const running = campaignRows().filter((c) => c.status === "active" || c.status === "approved" || c.status === "paused").slice(0, 5);
  const activity = listActivity(6);
  const kpis: { label: string; value: string; hint: string; href: string }[] = [
    { label: "Chi phí tháng này", value: formatCurrency(cost.spent), hint: `ngân sách ${formatCurrency(cost.budget)}`, href: "/reports?tab=costs" },
    { label: "Lead", value: String(leads.total), hint: `${leads.won} đã mua`, href: "/reports?tab=leads" },
    { label: "Đơn đã thanh toán", value: String(orders.paid), hint: orders.pending ? `${orders.pending} đơn chờ` : "không có đơn chờ", href: "/customers?tab=orders" },
    { label: "Doanh thu", value: formatCurrency(orders.revenue), hint: roas != null ? `ROAS ${roas}x` : "chưa có chi phí để tính ROAS", href: "/reports?tab=orders" },
  ];

  // 4 chỉ số quan trọng. Màu trạng thái chỉ khi có việc cần chú ý.
  const tiles: { label: string; value: number; icon: typeof ListChecks; href: string; tone?: "amber" | "brick" }[] = [
    { label: "Chờ tôi duyệt", value: stats.pendingApproval, icon: ListChecks, href: "#cho-toi-xu-ly", tone: stats.pendingApproval ? "amber" : undefined },
    { label: "Lịch đăng hôm nay", value: stats.postsToday, icon: CalendarClock, href: "/publishing" },
    { label: "Lead mới hôm nay", value: stats.leadsToday, icon: UserPlus, href: "/customers?tab=leads" },
    { label: "Cảnh báo", value: stats.alerts, icon: AlertTriangle, href: "#tinh-trang-he-thong", tone: stats.alerts ? "brick" : undefined },
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

      <div className="mt-3.5 grid gap-3.5 lg:grid-cols-[2fr_1fr] lg:items-start">
        {/* 2. Chờ tôi xử lý: tối đa 5 việc ưu tiên nhất */}
        <Panel id="cho-toi-xu-ly" className="mt-0">
          <PanelHeader title="Chờ tôi xử lý" sub={pending.length > 5 ? `5 việc ưu tiên nhất trong ${pending.length} việc.` : pending.length ? `${pending.length} việc đang chờ.` : "Không có việc nào."} />
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
        <Panel className="mt-0">
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

      {/* 4. Kết quả tháng này: cùng công thức với Báo cáo */}
      <div className="mt-3.5 flex items-baseline justify-between">
        <h2 className="text-[13px] font-bold text-ink">Kết quả tháng {month.slice(5, 7)}</h2>
        <Link href="/reports" className="text-[12.5px] font-medium text-jade hover:underline">Xem báo cáo</Link>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {kpis.map((k) => (
          <Link key={k.label} href={k.href} className="card px-3.5 py-2.5 transition-colors hover:border-ink-3 hover:bg-ground-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-jade">
            <div className="truncate text-[12px] font-medium text-ink-2">{k.label}</div>
            <div className="num truncate text-[20px] font-bold leading-tight tracking-[-0.02em] text-ink">{k.value}</div>
            <div className="truncate text-[11.5px] text-ink-3">{k.hint}</div>
          </Link>
        ))}
      </div>

      <div className="mt-3.5 grid gap-3.5 lg:grid-cols-[2fr_1fr] lg:items-start">
        {/* 5. Chiến dịch đang chạy */}
        <Panel className="mt-0">
          <PanelHeader title="Chiến dịch đang chạy" sub={running.length ? `${running.length} chiến dịch đã duyệt hoặc đang thực hiện.` : "Chưa có chiến dịch nào đang chạy."} action={<Link href="/campaigns" className="text-[12.5px] font-medium text-jade hover:underline">Tất cả</Link>} />
          {running.length === 0 ? (
            <EmptyState title="Chưa có chiến dịch đang chạy" hint="Tạo chiến dịch, gửi phê duyệt và kích hoạt để theo dõi tiến độ ở đây." />
          ) : (
            <ul className="m-0 list-none p-0">
              {running.map((c) => {
                const t = timingLabel(c.startDate, c.endDate, today);
                return (
                  <li key={c.id} className="grid gap-2 border-b border-border px-4 py-3 last:border-b-0 md:grid-cols-[minmax(0,1fr)_160px] md:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/campaigns/${c.id}`} className="truncate text-[13px] font-semibold text-ink hover:underline">{c.name}</Link>
                        <CampaignStatusPill status={c.status} />
                        <span className={cn("text-[11.5px]", t.tone === "brick" ? "text-brick" : t.tone === "amber" ? "text-amber" : "text-ink-3")}>{t.text}</span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 text-[12px] text-ink-2">
                        <span>{c.leads} lead</span>
                        <span>{c.orders} đơn</span>
                        <span className="num">{formatCurrency(c.revenue)} doanh thu</span>
                        <span className="num">{formatCurrency(c.spent)} / {formatCurrency(c.budget)}</span>
                      </div>
                    </div>
                    <div>
                      <div className="mb-1 flex items-center justify-between text-[11.5px] text-ink-2"><span>Tiến độ</span><span className="num font-semibold text-ink">{c.progress}%</span></div>
                      <ProgressBar value={c.progress} label={`Tiến độ ${c.name}`} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        {/* 6. Hoạt động gần đây */}
        <Panel className="mt-0">
          <PanelHeader title="Hoạt động gần đây" sub="Người, AI và hệ thống vừa làm gì." action={<Link href="/settings#syslog" className="text-[12.5px] font-medium text-jade hover:underline">Nhật ký</Link>} />
          {activity.length === 0 ? (
            <EmptyState title="Chưa có hoạt động" />
          ) : (
            <ol className="m-0 list-none p-0">
              {activity.map((a) => (
                <li key={a.id} className="flex gap-3 border-b border-border px-4 py-2.5 last:border-b-0">
                  <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", a.actor === "ai" ? "bg-violet" : a.actor === "system" ? "bg-ink-3" : "bg-jade")} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-2 text-[12.5px] text-ink">{a.message}</div>
                    <div className="num mt-0.5 text-[11px] text-ink-3">{formatDateTime(a.at)}</div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>

      {/* 7. Thanh tóm tắt tình trạng hệ thống */}
      <SystemStatusBar status={system} />
    </>
  );
}
