import Link from "next/link";
import { PageHead, Panel, PanelHeader, Rows, Row } from "@/components/ui/card";
import { Pill, Score } from "@/components/ui/pill";
import { Tiles, Tile } from "@/components/ui/stat";
import { Button, LinkButton } from "@/components/ui/button";
import { platformLabel } from "@/components/ui/platform";
import { pipelineSteps } from "@/lib/data/pipeline";
import { contentItems, scheduledPosts } from "@/lib/data/content";
import { adCampaigns } from "@/lib/data/ads";
import { conversations } from "@/lib/data/customers";
import { insights } from "@/lib/data/insights";
import { formatDate, formatTime, cn } from "@/lib/format";

export const metadata = { title: "Điều hành – BAOR AI OS" };

export default function DashboardPage() {
  const proposals = contentItems.filter((c) => c.status === "proposed").sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 2);
  const adsPending = adCampaigns.filter((a) => a.status === "pending_approval");
  const needHuman = conversations.filter((c) => c.needsHuman);
  const pending = proposals.length + adsPending.length + needHuman.length;
  const upcoming = scheduledPosts.filter((p) => p.status === "scheduled").sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor)).slice(0, 3);

  return (
    <>
      <PageHead
        title="Hôm nay, thứ 5 · 10/09"
        sub={`AI đã chuẩn bị sẵn. Bạn có ${pending} việc cần quyết, còn lại hệ thống tự chạy.`}
        action={<Button variant="primary" size="md">Xử lý {pending} việc chờ</Button>}
      />

      <Tiles>
        <Tile label="Tiếp cận 7 ngày" value="128.400" delta="▲ 12%" hint="Tất cả bài đăng" />
        <Tile label="Lead mới" value="142" delta="▲ 22%" hint="Inbox, bình luận, ads" />
        <Tile label="Chi phí / lead" value="29.900 ₫" delta="▼ 18%" hint="Thấp hơn là tốt" />
        <Tile label="Ads tháng này" value="4,25 tr" delta="/ 12 tr" hint="Còn trong hạn mức" />
      </Tiles>

      <div className="mt-3.5 grid grid-cols-4 gap-1.5 md:grid-cols-8" aria-label="Quy trình 8 bước">
        {pipelineSteps.map((s) => {
          const wait = s.status === "waiting_approval" || s.owner === "human";
          return (
            <Link
              key={s.key}
              href={s.href}
              className={cn(
                "card flex min-h-[86px] flex-col gap-1.5 p-2.5 transition-colors hover:border-ink-3",
                wait && "border-amber bg-[color-mix(in_srgb,var(--amber-soft)_55%,var(--surface))]",
              )}
            >
              <span className="text-[10px] font-bold tracking-[0.06em] text-ink-3">BƯỚC {s.order}</span>
              <span className="text-[12px] font-semibold leading-tight text-ink">{s.title}</span>
              <span className={cn("mt-auto flex items-center gap-1.5 text-[11px] font-semibold", wait ? "text-amber" : "text-ink-2")}>
                {s.status === "running" && !wait && <span className="live" style={{ width: 6, height: 6 }} />}
                {s.pendingCount ? `${s.pendingCount} ${s.owner === "human" ? "đang làm" : "chờ bạn"}` : s.status === "done" ? "Xong" : "Đang chạy"}
              </span>
            </Link>
          );
        })}
      </div>

      <div className="grid gap-3.5 md:grid-cols-[1.6fr_1fr]">
        <Panel>
          <PanelHeader title="Việc cần bạn" sub="Duyệt hoặc nhận làm, mỗi việc một nút." />
          <Rows>
            {proposals.map((c) => {
              const ins = insights.find((i) => i.id === c.insightId);
              return (
                <Row
                  key={c.id}
                  lead={<Score value={c.score ?? 0} />}
                  title={c.title}
                  sub={`Ý tưởng ${contentFormat(c.format)} · từ insight “${ins?.title ?? ""}”`}
                  action={<LinkButton href="/content" variant="soft">Nhận làm</LinkButton>}
                />
              );
            })}
            {adsPending.map((a) => (
              <Row
                key={a.id}
                lead={<Pill tone="amber">Ads</Pill>}
                title={a.name}
                sub={`${a.dailyBudget.toLocaleString("vi-VN")} ₫/ngày · ${a.aiNote}`}
                action={<LinkButton href="/publishing?tab=ads" variant="primary">Duyệt chạy</LinkButton>}
              />
            ))}
            {needHuman.map((c) => (
              <Row
                key={c.id}
                lead={<Pill tone="brick">Inbox</Pill>}
                title={c.leadName}
                sub={`“${c.messages[c.messages.length - 1].text}”`}
                action={<LinkButton href={`/customers?conv=${c.id}`}>Trả lời</LinkButton>}
              />
            ))}
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
                sub={platformLabel(p.platform)}
              />
            ))}
          </Rows>
        </Panel>
      </div>
    </>
  );
}

function contentFormat(f: string) {
  return { post: "bài viết", reel: "reel", carousel: "carousel", story: "story", article: "bài dài" }[f] ?? f;
}
