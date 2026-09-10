import Link from "next/link";
import { PageHead, Panel, PanelHeader, Rows, Row } from "@/components/ui/card";
import { Pill, Score } from "@/components/ui/pill";
import { Tiles, Tile } from "@/components/ui/stat";
import { Button, LinkButton } from "@/components/ui/button";
import { platformLabel } from "@/components/ui/platform";
import { claimIdea } from "@/lib/actions/content";
import { approveAd } from "@/lib/actions/ads";
import { listActivity, listAds, listContent, listConversations, listInsights, listPosts, pendingCounts } from "@/lib/queries";
import { contentFormatLabel } from "@/lib/labels";
import { formatDate, formatDateTime, formatNumber, formatTime, cn } from "@/lib/format";
import type { Platform } from "@/lib/types";

export const metadata = { title: "Điều hành – BAOR AI OS" };

const steps = [
  { order: 1, title: "Research nền tảng", key: "research", href: "/research" },
  { order: 2, title: "Insight khách hàng", key: "insights", href: "/research" },
  { order: 3, title: "AI đề xuất nội dung", key: "content", href: "/content" },
  { order: 4, title: "Bạn hoàn thiện", key: "creator", href: "/content?tab=mine" },
  { order: 5, title: "Tự đăng bài", key: "publishing", href: "/publishing" },
  { order: 6, title: "Tự chạy ads", key: "ads", href: "/publishing" },
  { order: 7, title: "Kết nối khách", key: "customers", href: "/customers" },
  { order: 8, title: "Email marketing", key: "email", href: "/customers?tab=email" },
];

export default function DashboardPage() {
  const counts = pendingCounts();
  const pending = counts.ideas + counts.ads + counts.convs;
  const proposals = listContent(["proposed"]).slice(0, 3);
  const adsPending = listAds().filter((a) => a.status === "pending_approval");
  const needHuman = listConversations().filter((c) => c.needsHuman);
  const posts = listPosts();
  const upcoming = posts.filter((p) => p.status === "scheduled").sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor)).slice(0, 4);
  const published = posts.filter((p) => p.status === "published");
  const reach = published.reduce((n, p) => n + (p.reach ?? 0), 0);
  const insights = listInsights();
  const activity = listActivity(6);
  const today = new Date();
  const weekday = ["Chủ nhật", "thứ 2", "thứ 3", "thứ 4", "thứ 5", "thứ 6", "thứ 7"][Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Ho_Chi_Minh", weekday: "short" }).format(today) === "Sun" ? 0 : today.getDay())];

  const stepState = (key: string) => {
    if (key === "content") return counts.ideas ? { wait: true, text: `${counts.ideas} chờ bạn` } : { wait: false, text: "Đang chạy" };
    if (key === "creator") return counts.mine ? { wait: true, text: `${counts.mine} đang làm` } : { wait: false, text: "Trống" };
    if (key === "ads") return counts.ads ? { wait: true, text: `${counts.ads} chờ duyệt` } : { wait: false, text: "Đang chạy" };
    if (key === "customers") return counts.convs ? { wait: true, text: `${counts.convs} cần bạn` } : { wait: false, text: "Đang chạy" };
    if (key === "research" || key === "insights") return { wait: false, text: "Xong" };
    return { wait: false, text: "Đang chạy" };
  };

  return (
    <>
      <PageHead
        title={`Hôm nay, ${weekday} · ${formatDate(today.toISOString()).slice(0, 5)}`}
        sub={pending ? `AI đã chuẩn bị sẵn. Bạn có ${pending} việc cần quyết, còn lại hệ thống tự chạy.` : "Không có việc nào chờ bạn. Hệ thống đang tự chạy."}
        action={pending ? <LinkButton href="#viec-can-ban" variant="primary" size="md">Xử lý {pending} việc chờ</LinkButton> : undefined}
      />

      <Tiles>
        <Tile label="Tiếp cận 7 ngày" value={formatNumber(reach)} hint={`${published.length} bài đã đăng`} />
        <Tile label="Insight đang dùng" value={String(insights.length)} hint="Từ bình luận, inbox, CRM" />
        <Tile label="Ý tưởng chờ bạn" value={String(counts.ideas)} hint="AI đề xuất" />
        <Tile label="Khách chờ trả lời" value={String(counts.convs)} hint="AI đã chuyển cho bạn" tone={counts.convs ? "brick" : undefined} />
      </Tiles>

      <div className="mt-3.5 grid grid-cols-4 gap-1.5 md:grid-cols-8" aria-label="Quy trình 8 bước">
        {steps.map((s) => {
          const st = stepState(s.key);
          return (
            <Link
              key={s.key}
              href={s.href}
              className={cn(
                "card flex min-h-[86px] flex-col gap-1.5 p-2.5 transition-colors hover:border-ink-3",
                st.wait && "border-amber bg-[color-mix(in_srgb,var(--amber-soft)_55%,var(--surface))]",
              )}
            >
              <span className="text-[10px] font-bold tracking-[0.06em] text-ink-3">BƯỚC {s.order}</span>
              <span className="text-[12px] font-semibold leading-tight text-ink">{s.title}</span>
              <span className={cn("mt-auto flex items-center gap-1.5 text-[11px] font-semibold", st.wait ? "text-amber" : "text-ink-2")}>
                {!st.wait && st.text === "Đang chạy" && <span className="live" style={{ width: 6, height: 6 }} />}
                {st.text}
              </span>
            </Link>
          );
        })}
      </div>

      <div className="grid gap-3.5 md:grid-cols-[1.6fr_1fr]">
        <Panel>
          <div id="viec-can-ban" />
          <PanelHeader title="Việc cần bạn" sub="Duyệt hoặc nhận làm, mỗi việc một nút." />
          <Rows>
            {proposals.map((c) => {
              const ins = insights.find((i) => i.id === c.insightId);
              return (
                <Row
                  key={c.id}
                  lead={<Score value={c.score ?? 0} />}
                  title={c.title}
                  sub={`Ý tưởng ${contentFormatLabel[c.format]?.toLowerCase() ?? c.format}${ins ? ` · từ insight “${ins.title}”` : ""}`}
                  action={
                    <form action={claimIdea}>
                      <input type="hidden" name="id" value={c.id} />
                      <Button variant="soft" type="submit">Nhận làm</Button>
                    </form>
                  }
                />
              );
            })}
            {adsPending.map((a) => (
              <Row
                key={a.id}
                lead={<Pill tone="amber">Ads</Pill>}
                title={a.name}
                sub={`${formatNumber(a.dailyBudget)} ₫/ngày · ${a.aiNote ?? ""}`}
                action={
                  <form action={approveAd}>
                    <input type="hidden" name="id" value={a.id} />
                    <Button variant="primary" type="submit">Duyệt chạy</Button>
                  </form>
                }
              />
            ))}
            {needHuman.map((c) => (
              <Row
                key={c.id}
                lead={<Pill tone="brick">Inbox</Pill>}
                title={c.leadName}
                sub={`“${c.messages[c.messages.length - 1]?.text ?? ""}”`}
                action={<LinkButton href={`/customers?conv=${c.id}`}>Trả lời</LinkButton>}
              />
            ))}
            {pending === 0 && <li className="px-4 py-6 text-center text-[12.5px] text-ink-2">Không có việc nào chờ bạn.</li>}
          </Rows>
        </Panel>

        <Panel>
          <PanelHeader title="Sắp đăng" sub="Theo giờ vàng từng kênh." />
          <Rows>
            {upcoming.map((p) => (
              <Row
                key={p.id}
                lead={
                  <span className="num block text-[12.5px] font-semibold leading-tight text-ink-2">
                    {formatTime(p.scheduledFor)}
                    <br />
                    <small className="font-normal">{formatDate(p.scheduledFor).slice(0, 5)}</small>
                  </span>
                }
                title={p.title}
                sub={platformLabel(p.platform as Platform)}
              />
            ))}
            {upcoming.length === 0 && <li className="px-4 py-6 text-center text-[12.5px] text-ink-2">Chưa có bài nào được lên lịch.</li>}
          </Rows>
        </Panel>
      </div>

      <Panel>
        <PanelHeader title="Hoạt động gần đây" />
        <ul className="m-0 list-none p-0">
          {activity.map((a) => (
            <li key={a.id} className="flex items-start gap-3 border-b border-border px-4 py-2 text-[12.5px] last:border-b-0">
              <span className="num w-[84px] shrink-0 whitespace-nowrap text-ink-3">{formatDateTime(a.at)}</span>
              <Pill tone={a.actor === "ai" ? "violet" : a.actor === "human" ? "amber" : "neutral"}>
                {a.actor === "ai" ? "AI" : a.actor === "human" ? "Bạn" : "Hệ thống"}
              </Pill>
              <span className="text-ink">{a.message}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </>
  );
}
