import Link from "next/link";
import { AlertTriangle, CalendarClock, Clapperboard, FileText, ListChecks } from "lucide-react";
import { Panel, PanelHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status";
import { getAgents, getApprovals, getOverview, getRecentActivity, getTimeline } from "@/lib/dashboard-data";
import { agentStatusLabel, priorityLabel } from "@/lib/mock/dashboard";
import { formatDate, formatDateTime, cn } from "@/lib/format";

export const metadata = { title: "Điều hành – BAOR AI OS" };

const weekdays = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];

export default function DashboardPage() {
  const now = new Date();
  const vnDay = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Ho_Chi_Minh", weekday: "short" }).format(now);
  const weekday = weekdays[["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(vnDay)] ?? "";
  const stats = getOverview();
  const approvals = getApprovals();
  const timeline = getTimeline();
  const agents = getAgents();
  const activity = getRecentActivity();

  const tiles: { label: string; value: number; icon: typeof FileText; href: string; tone?: "amber" | "brick" }[] = [
    { label: "Nội dung đang thực hiện", value: stats.inProgress, icon: FileText, href: "/content?tab=mine" },
    { label: "Nội dung chờ duyệt", value: stats.contentPending, icon: ListChecks, href: "/content", tone: stats.contentPending ? "amber" : undefined },
    { label: "Video chờ duyệt", value: stats.videoPending, icon: Clapperboard, href: "/video-studio", tone: stats.videoPending ? "amber" : undefined },
    { label: "Lịch đăng hôm nay", value: stats.postsToday, icon: CalendarClock, href: "/publishing" },
    { label: "Cảnh báo cần xử lý", value: stats.alerts, icon: AlertTriangle, href: "#can-xu-ly", tone: stats.alerts ? "brick" : undefined },
  ];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-bold tracking-[-0.01em] text-ink">Điều hành</h1>
          <p className="mt-1 text-ink-2">
            {weekday}, {formatDate(now.toISOString())}. {approvals.length ? `Có ${approvals.length} việc cần anh xử lý.` : "Không có việc nào chờ anh."} Agent không xuất bản khi chưa được phê duyệt.
          </p>
        </div>
        {approvals.length > 0 && <LinkButton href="#can-xu-ly" variant="primary" size="md">Xử lý ngay</LinkButton>}
      </div>

      {/* Hàng chỉ số tổng quan */}
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-5">
        {tiles.map((t) => {
          const Icon = t.icon;
          return (
            <Link key={t.label} href={t.href} className="card flex items-start justify-between gap-2 px-3.5 py-3 transition-colors hover:border-ink-3">
              <div>
                <div className="text-[12px] font-medium text-ink-2">{t.label}</div>
                <div className={cn("num mt-1 text-[24px] font-bold tracking-[-0.02em]", t.tone === "brick" ? "text-brick" : t.tone === "amber" ? "text-amber" : "text-ink")}>{t.value}</div>
              </div>
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-ground-2 text-ink-3"><Icon size={16} aria-hidden /></span>
            </Link>
          );
        })}
      </div>

      <div className="grid gap-3.5 xl:grid-cols-[1.5fr_1fr]">
        {/* Cần anh xử lý */}
        <Panel id="can-xu-ly">
          <PanelHeader title="Cần anh xử lý" sub="Nội dung, video chờ duyệt; lịch đăng cần xác nhận; quy trình gặp lỗi." />
          {approvals.length === 0 ? (
            <EmptyState title="Không có việc nào chờ anh" hint="Khi Agent gửi nội dung, video hoặc gặp lỗi, mục đó sẽ hiện ở đây." />
          ) : (
            <ul className="m-0 list-none p-0">
              {approvals.map((a) => {
                const pr = priorityLabel[a.priority];
                return (
                  <li key={a.id} className="grid gap-2 border-b border-border px-4 py-3 last:border-b-0 md:grid-cols-[1fr_auto] md:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Pill tone={pr.tone}>{pr.label}</Pill>
                        <span className="truncate text-[13px] font-semibold text-ink">{a.title}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-2">
                        <span>{a.module}</span>
                        <span className={cn(a.actorType === "agent" && "text-violet")}>{a.actor}</span>
                        <span className="num">{formatDateTime(a.sentAt)}</span>
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      <LinkButton href={a.moduleHref} variant="ghost">Xem</LinkButton>
                      <LinkButton href={a.moduleHref} variant="soft">Xử lý</LinkButton>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        {/* Lịch hoạt động hôm nay */}
        <Panel>
          <PanelHeader title="Lịch hoạt động hôm nay" sub="Đăng bài, xuất bản video, chiến dịch, việc sắp đến hạn." />
          {timeline.length === 0 ? (
            <EmptyState title="Hôm nay chưa có hoạt động" />
          ) : (
            <ol className="m-0 list-none p-0">
              {timeline.map((t, i) => (
                <li key={t.id} className="relative flex gap-3 px-4 py-2.5">
                  {i < timeline.length - 1 && <span className="absolute left-[64px] top-7 h-[calc(100%-8px)] w-px bg-border" aria-hidden />}
                  <span className="num w-10 shrink-0 pt-0.5 text-[12.5px] font-semibold text-ink-2">{t.time}</span>
                  <span className={cn("relative mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border-2 border-surface", t.status === "done" ? "bg-jade" : t.status === "needs_confirm" ? "bg-amber" : "bg-ink-3")} aria-hidden />
                  <div className="min-w-0">
                    <div className={cn("text-[13px]", t.status === "done" ? "text-ink-2" : "text-ink")}>{t.title}</div>
                    <div className="mt-0.5 text-[11.5px] text-ink-3">
                      {t.status === "done" ? "Đã xong" : t.status === "needs_confirm" ? "Cần anh xác nhận trước khi Agent thực hiện" : "Sắp tới"}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>

      <div className="grid gap-3.5 xl:grid-cols-2">
        {/* Trạng thái AI Agent */}
        <Panel>
          <PanelHeader title="Trạng thái AI Agent" sub="Agent chỉ chuẩn bị và đề xuất. Mọi việc xuất bản đều chờ anh phê duyệt." />
          <ul className="m-0 list-none p-0">
            {agents.map((ag) => {
              const st = agentStatusLabel[ag.status];
              return (
                <li key={ag.id} className="flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-b-0">
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-ink">{ag.name}</div>
                    <div className="truncate text-[12px] text-ink-2">{ag.task}</div>
                  </div>
                  <StatusPill status={ag.status === "active" ? "active" : ag.status === "needs_approval" ? "pending" : ag.status === "error" ? "error" : "disabled"} label={st.label} />
                </li>
              );
            })}
          </ul>
        </Panel>

        {/* Hoạt động gần đây */}
        <Panel>
          <PanelHeader title="Hoạt động gần đây" sub="Ai vừa tạo, duyệt, lên lịch; Agent vừa hoàn thành; lỗi vừa xuất hiện." />
          {activity.length === 0 ? (
            <EmptyState title="Chưa có hoạt động" />
          ) : (
            <ul className="m-0 list-none p-0">
              {activity.map((a) => (
                <li key={a.id} className="flex items-start gap-3 border-b border-border px-4 py-2 text-[12.5px] last:border-b-0">
                  <span className="num w-[84px] shrink-0 whitespace-nowrap text-ink-3">{formatDateTime(a.at)}</span>
                  <Pill tone={a.actor === "ai" ? "violet" : a.actor === "human" ? "amber" : "neutral"}>{a.actor === "ai" ? "Agent" : a.actor === "human" ? "Anh" : "Hệ thống"}</Pill>
                  <span className="text-ink">{a.message}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
