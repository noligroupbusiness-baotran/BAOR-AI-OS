import { Card, CardHeader, SectionLabel } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Pill, Dot } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { StatTile, ProgressBar } from "@/components/ui/stat";
import { Toggle } from "@/components/ui/toggle";
import { adBudgetGuardrails, adCampaigns } from "@/lib/data/ads";
import { adObjectiveLabel, adStatusLabel } from "@/lib/labels";
import { formatCurrency, formatNumber, cn } from "@/lib/format";

export const metadata = { title: "Quảng cáo – BAOR AI OS" };

export default async function AdsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab = "campaigns" } = await searchParams;
  const g = adBudgetGuardrails;
  const active = adCampaigns.filter((a) => a.status === "active");
  const totalSpent = adCampaigns.reduce((n, a) => n + a.spent, 0);
  const totalLeads = adCampaigns.reduce((n, a) => n + a.leads, 0);
  const cpl = totalLeads ? totalSpent / totalLeads : 0;

  return (
    <>
      <PageHeader
        emoji="📣"
        title="Tự chạy quảng cáo"
        subtitle="Bước 6. Bài đăng vượt ngưỡng tương tác được AI đề xuất thành chiến dịch. Mọi chiến dịch tiêu tiền thật đều tạo ở trạng thái tạm dừng và chỉ bật khi bạn duyệt. AI tự tắt chiến dịch vượt ngưỡng chi phí/lead."
        meta={
          <>
            <span className="flex items-center gap-1.5">
              <Dot tone="green" live /> {active.length} chiến dịch đang chạy
            </span>
            <span>·</span>
            <span>Tối ưu mỗi 6 giờ</span>
          </>
        }
        actions={
          <>
            <Button variant="primary">🤖 AI đề xuất chiến dịch</Button>
            <Button>+ Tạo thủ công</Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Chi tiêu tháng" value={formatCurrency(g.spentThisMonth)} hint={`Hạn mức ${formatCurrency(g.monthlyCap)}`} />
        <StatTile label="Lead từ ads" value={String(totalLeads)} delta={21.7} />
        <StatTile label="Chi phí / lead" value={formatCurrency(Math.round(cpl))} delta={-18.3} hint="Ngưỡng tự tắt: 60.000 ₫" />
        <StatTile label="Chờ bạn duyệt" value={String(adCampaigns.filter((a) => a.status === "pending_approval").length)} hint="Tiêu tiền thật" />
      </div>

      <div className="mt-4">
        <FilterTabs
          basePath="/ads"
          active={tab}
          tabs={[
            { key: "campaigns", label: "Chiến dịch", emoji: "📣", count: adCampaigns.length },
            { key: "budget", label: "Ngân sách & rào chắn", emoji: "🛡️" },
          ]}
        />
      </div>

      {tab === "campaigns" && (
        <div className="mt-4 space-y-3">
          {adCampaigns.map((a) => {
            const st = adStatusLabel[a.status];
            const ctr = a.impressions ? (a.clicks / a.impressions) * 100 : 0;
            const cplA = a.leads ? a.spent / a.leads : 0;
            return (
              <Card
                key={a.id}
                className={cn(a.status === "pending_approval" && "border-gold/40 bg-gold-soft/30")}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill tone={st.tone}>
                        {a.status === "active" && <Dot tone="green" live />}
                        {st.label}
                      </Pill>
                      <h3 className="text-[14px] font-bold text-ink">{a.name}</h3>
                      <Pill tone="blue" size="xs">🎯 {adObjectiveLabel[a.objective]}</Pill>
                    </div>
                    <div className="mt-1 text-[12px] text-muted">👥 {a.audience}</div>
                    {a.aiNote && (
                      <p className="mt-2 inline-block rounded-md bg-surface-soft px-2.5 py-1.5 text-[12px] text-ink">
                        🤖 {a.aiNote}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    {a.status === "pending_approval" && (
                      <>
                        <Button size="xs" variant="primary">✅ Duyệt & bật</Button>
                        <Button size="xs">✏️ Sửa</Button>
                        <Button size="xs" variant="danger">Từ chối</Button>
                      </>
                    )}
                    {a.status === "active" && (
                      <>
                        <Button size="xs" variant="soft">⬆ Tăng ngân sách</Button>
                        <Button size="xs">⏸ Tạm dừng</Button>
                      </>
                    )}
                    {a.status === "paused" && <Button size="xs" variant="primary">▶ Bật lại</Button>}
                    {a.status === "proposed" && <Button size="xs" variant="ghost">Xem lý do</Button>}
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-3 border-t border-border pt-3 text-[12px] sm:grid-cols-6">
                  <div>
                    <div className="eyebrow">Ngân sách/ngày</div>
                    <div className="mt-0.5 font-semibold tabular-nums text-ink">{formatNumber(a.dailyBudget)} ₫</div>
                  </div>
                  <div>
                    <div className="eyebrow">Đã chi</div>
                    <div className="mt-0.5 font-semibold tabular-nums text-ink">{formatNumber(a.spent)} ₫</div>
                  </div>
                  <div>
                    <div className="eyebrow">Hiển thị</div>
                    <div className="mt-0.5 font-semibold tabular-nums text-ink">{formatNumber(a.impressions)}</div>
                  </div>
                  <div>
                    <div className="eyebrow">CTR</div>
                    <div className="mt-0.5 font-semibold tabular-nums text-ink">{ctr.toFixed(2)}%</div>
                  </div>
                  <div>
                    <div className="eyebrow">Lead</div>
                    <div className="mt-0.5 font-semibold tabular-nums text-ink">{a.leads}</div>
                  </div>
                  <div>
                    <div className="eyebrow">Chi phí/lead</div>
                    <div
                      className={cn(
                        "mt-0.5 font-semibold tabular-nums",
                        cplA > g.autoPauseCplAbove ? "text-red" : cplA > 0 ? "text-primary-text" : "text-faint",
                      )}
                    >
                      {cplA ? `${formatNumber(Math.round(cplA))} ₫` : "—"}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {tab === "budget" && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader icon="💰" title="Hạn mức ngân sách" subtitle="AI không bao giờ vượt các mức này, kể cả khi hiệu quả tốt." tone="green" />
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between text-[12.5px]">
                  <span className="text-muted">Tháng này</span>
                  <span className="font-semibold tabular-nums text-ink">
                    {formatCurrency(g.spentThisMonth)} / {formatCurrency(g.monthlyCap)}
                  </span>
                </div>
                <ProgressBar value={(g.spentThisMonth / g.monthlyCap) * 100} className="mt-1.5" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="eyebrow">Tối đa / ngày</span>
                  <input
                    defaultValue={formatNumber(g.dailyCap)}
                    className="mt-1 h-8 w-full rounded-md border border-border-strong bg-bg-elevated px-2.5 text-[13px] tabular-nums"
                  />
                </label>
                <label className="block">
                  <span className="eyebrow">Tối đa / tháng</span>
                  <input
                    defaultValue={formatNumber(g.monthlyCap)}
                    className="mt-1 h-8 w-full rounded-md border border-border-strong bg-bg-elevated px-2.5 text-[13px] tabular-nums"
                  />
                </label>
              </div>
              <Button variant="primary" size="sm">Lưu hạn mức</Button>
            </div>
          </Card>
          <Card>
            <CardHeader icon="🛡️" title="Rào chắn tự động" subtitle="Quy tắc AI phải tuân theo khi tạo và tối ưu chiến dịch." tone="gold" />
            <ul className="divide-y divide-border/70">
              {[
                ["Luôn cần bạn duyệt trước khi bật chiến dịch mới", true],
                ["Tự tạm dừng khi chi phí/lead vượt 60.000 ₫ trong 3 ngày", true],
                ["Tự tăng ngân sách tối đa +25%/ngày khi CPL tốt hơn mục tiêu 20%", true],
                ["Chỉ đề xuất ads cho bài đạt tương tác ≥ 3% sau 6 giờ", true],
                ["Không chạy ads sau 23:00 (tránh click ảo)", false],
              ].map(([label, on]) => (
                <li key={label as string} className="flex items-center justify-between gap-3 py-2.5 text-[12.5px] text-ink">
                  <span>{label as string}</span>
                  <Toggle defaultChecked={on as boolean} label={label as string} />
                </li>
              ))}
            </ul>
            <div className="mt-3 border-t border-border pt-3">
              <SectionLabel>Nhật ký rào chắn</SectionLabel>
              <p className="mt-1 text-[12px] text-muted">
                08/09 · Tự tạm dừng “Lookalike GenZ TikTok”: CPL 71.400 ₫ vượt ngưỡng 3 ngày liên tiếp.
              </p>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
