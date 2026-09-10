import Link from "next/link";
import { Card, CardHeader, SectionLabel } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Pill, ScoreBadge, Dot } from "@/components/ui/pill";
import { StatTile } from "@/components/ui/stat";
import { LinkButton } from "@/components/ui/button";
import { PlatformPill } from "@/components/ui/platform";
import { dashboardKpis, pipelineSteps, recentActivity } from "@/lib/data/pipeline";
import { contentItems, scheduledPosts } from "@/lib/data/content";
import { adCampaigns } from "@/lib/data/ads";
import { conversations } from "@/lib/data/customers";
import { stepStatusLabel, ownerLabel } from "@/lib/labels";
import { formatDateTime, formatNumber, cn } from "@/lib/format";

export const metadata = { title: "Trung tâm điều hành – BAOR AI OS" };

export default function DashboardPage() {
  const proposals = contentItems.filter((c) => c.status === "proposed");
  const adsPending = adCampaigns.filter((a) => a.status === "pending_approval");
  const needHuman = conversations.filter((c) => c.needsHuman);
  const upcoming = scheduledPosts
    .filter((p) => p.status === "scheduled")
    .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor))
    .slice(0, 4);
  const topPosts = scheduledPosts
    .filter((p) => p.status === "published" && p.reach)
    .sort((a, b) => (b.engagement ?? 0) - (a.engagement ?? 0))
    .slice(0, 3);

  return (
    <>
      <PageHeader
        emoji="🎛️"
        title="Trung tâm điều hành"
        subtitle="Toàn cảnh quy trình 8 bước: AI research và đề xuất, bạn làm nội dung, hệ thống tự đăng, chạy ads, chăm khách và gửi email."
        meta={
          <>
            <span>Thứ 5, 10/09/2026</span>
            <span>·</span>
            <span className="flex items-center gap-1.5">
              <Dot tone="green" live /> 3 agent đang chạy
            </span>
            <span>·</span>
            <span className="font-medium text-gold">5 việc chờ bạn</span>
          </>
        }
        actions={
          <>
            <LinkButton href="/content" variant="primary">
              💡 Xem ý tưởng hôm nay
            </LinkButton>
            <LinkButton href="/approvals">✅ Hộp chờ duyệt</LinkButton>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {dashboardKpis.map((k) => (
          <StatTile key={k.label} label={k.label} value={k.value} delta={k.delta} hint={k.hint} />
        ))}
      </div>

      <Card className="mt-4" padded={false}>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <SectionLabel tone="green">🔁 Quy trình tự động</SectionLabel>
            <p className="mt-0.5 text-[12px] text-muted">
              Mỗi ô là một bước. Ô vàng đang chờ bạn, ô xanh đang chạy nền.
            </p>
          </div>
          <Link href="/settings?tab=automation" className="text-[12px] text-primary-text hover:underline">
            Cấu hình tự động hóa →
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-px bg-border md:grid-cols-4 xl:grid-cols-8">
          {pipelineSteps.map((s) => {
            const st = stepStatusLabel[s.status];
            const owner = ownerLabel[s.owner];
            return (
              <Link
                key={s.key}
                href={s.href}
                className={cn(
                  "group flex flex-col gap-2 bg-surface p-3 transition-colors hover:bg-bg-elevated",
                  s.status === "waiting_approval" && "bg-gold-soft/40",
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10.5px] font-bold text-faint">BƯỚC {s.order}</span>
                  <Pill tone={owner.tone} size="xs">
                    {owner.emoji} {owner.label}
                  </Pill>
                </div>
                <div className="text-[12.5px] font-semibold leading-snug text-ink">{s.title}</div>
                <div className="line-clamp-2 text-[11px] text-muted">{s.description}</div>
                <div className="mt-auto flex items-center justify-between pt-1">
                  <Pill tone={st.tone} size="xs">
                    {s.status === "running" && <Dot tone="green" live />}
                    {st.label}
                  </Pill>
                  {s.pendingCount ? (
                    <span className="text-[11px] font-semibold text-gold">{s.pendingCount} chờ</span>
                  ) : s.lastRunAt ? (
                    <span className="text-[10.5px] text-faint">{formatDateTime(s.lastRunAt)}</span>
                  ) : null}
                </div>
              </Link>
            );
          })}
        </div>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            icon="🙋"
            title="Việc cần bạn làm hôm nay"
            subtitle="AI đã chuẩn bị sẵn, bạn chỉ cần duyệt hoặc hoàn thiện."
            tone="gold"
            action={<LinkButton href="/approvals" size="xs">Xem tất cả</LinkButton>}
          />
          <ul className="divide-y divide-border/70">
            {proposals.slice(0, 3).map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-2">
                <ScoreBadge score={c.score ?? 0} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-ink">{c.title}</div>
                  <div className="truncate text-[11.5px] text-muted">
                    Ý tưởng nội dung · {c.pillar} · {c.hook}
                  </div>
                </div>
                <LinkButton href={`/content?tab=proposed#${c.id}`} size="xs" variant="soft">
                  Nhận viết
                </LinkButton>
              </li>
            ))}
            {adsPending.map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-2">
                <Pill tone="gold">📣 Ads</Pill>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-ink">{a.name}</div>
                  <div className="truncate text-[11.5px] text-muted">
                    {formatNumber(a.dailyBudget)} ₫/ngày · {a.aiNote}
                  </div>
                </div>
                <LinkButton href="/ads" size="xs" variant="primary">
                  Duyệt chạy
                </LinkButton>
              </li>
            ))}
            {needHuman.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-2">
                <Pill tone="red">💬 Inbox</Pill>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-ink">{c.leadName}</div>
                  <div className="truncate text-[11.5px] text-muted">
                    {c.messages[c.messages.length - 1].text}
                  </div>
                </div>
                <LinkButton href={`/customers?conv=${c.id}`} size="xs">
                  Trả lời
                </LinkButton>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader icon="📅" title="Sắp đăng" subtitle="Tự động đăng theo giờ vàng." tone="blue" />
          <ul className="space-y-2.5">
            {upcoming.map((p) => (
              <li key={p.id} className="flex items-start gap-2">
                <div className="w-[84px] shrink-0 whitespace-nowrap pt-0.5 text-[11px] font-semibold tabular-nums text-muted">
                  {formatDateTime(p.scheduledFor)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-medium text-ink">{p.title}</div>
                  <PlatformPill platform={p.platform} />
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-3 border-t border-border pt-3">
            <SectionLabel tone="green">🏆 Bài tốt nhất tuần</SectionLabel>
            <ul className="mt-2 space-y-2">
              {topPosts.map((p, i) => (
                <li key={p.id} className="flex items-center gap-2">
                  <span className="w-4 text-[11px] font-bold text-faint">{i + 1}.</span>
                  <div className="min-w-0 flex-1 truncate text-[12px] text-ink">{p.title}</div>
                  <span className="text-[11px] tabular-nums text-muted">
                    {formatNumber(p.reach ?? 0)} reach
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader icon="🕒" title="Hoạt động gần đây" subtitle="Nhật ký hành động của AI, hệ thống và bạn." />
        <ul className="space-y-2">
          {recentActivity.map((a) => {
            const o = ownerLabel[a.actor === "system" ? "auto" : a.actor];
            return (
              <li key={a.id} className="flex items-start gap-3 text-[12.5px]">
                <span className="w-[78px] shrink-0 whitespace-nowrap tabular-nums text-faint">{formatDateTime(a.at)}</span>
                <Pill tone={o.tone} size="xs">
                  {o.emoji} {o.label}
                </Pill>
                <span className="text-ink">{a.message}</span>
              </li>
            );
          })}
        </ul>
      </Card>
    </>
  );
}
