import Link from "next/link";
import { Breadcrumb, ModuleGroups } from "@/components/shell/module-page";
import { PageHead, Panel, PanelHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Button, LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Segment } from "@/components/ui/segment";
import { Table, Th, Td } from "@/components/ui/table";
import { ProgressBar } from "@/components/ui/progress";
import { inputClass } from "@/components/ui/field";
import { CampaignStatusPill } from "@/components/campaigns/status";
import { campaignRepo } from "@/lib/campaigns/repository";
import { campaignRows, channelRows, contentRows, costSummary, leadSummary, orderSummary, videoSummary, type ReportFilter } from "@/lib/reports/data";
import { leadSourceLabel, leadStageLabel } from "@/lib/labels";
import { platformLabel } from "@/components/ui/platform";
import type { LeadStage, Platform } from "@/lib/types";
import { formatCurrency, formatNumber, cn } from "@/lib/format";

export const metadata = { title: "Báo cáo – BAOR AI OS" };

const tabs = [
  { key: "overview", label: "Mục tiêu và kết quả" },
  { key: "channels", label: "Theo kênh" },
  { key: "content", label: "Nội dung và video" },
  { key: "leads", label: "Lead" },
  { key: "orders", label: "Đơn hàng và doanh thu" },
  { key: "costs", label: "Chi phí và ROAS" },
];

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ tab?: string; month?: string; campaign?: string }> }) {
  const sp = await searchParams;
  const tab = tabs.some((t) => t.key === sp.tab) ? sp.tab! : "overview";
  const f: ReportFilter = { month: sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : undefined, campaignId: sp.campaign || undefined };
  const filtering = !!(f.month || f.campaignId);
  const campaigns = campaignRepo.list();
  const rows = campaignRows(f);
  const totals = { leads: rows.reduce((n, r) => n + r.leads, 0), orders: rows.reduce((n, r) => n + r.orders, 0), revenue: rows.reduce((n, r) => n + r.revenue, 0), spent: rows.reduce((n, r) => n + r.spent, 0) };
  const sampleCount = rows.filter((r) => r.source === "sample").length;

  return (
    <>
      <Breadcrumb items={[{ label: "Điều hành", href: "/dashboard" }, { label: "Báo cáo" }]} />
      <PageHead title="Báo cáo" sub="So sánh mục tiêu đặt ra với kết quả thực tế. Mọi con số truy ngược được về chiến dịch, kênh, nội dung, lead và đơn hàng." />

      <form method="get" action="/reports" className="card grid gap-2 px-4 py-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <input type="hidden" name="tab" value={tab} />
        <label className="block"><span className="lbl">Tháng</span><input type="month" name="month" defaultValue={f.month ?? ""} className={`${inputClass} mt-1`} /></label>
        <label className="block">
          <span className="lbl">Chiến dịch</span>
          <select name="campaign" defaultValue={f.campaignId ?? ""} className={`${inputClass} mt-1`}>
            <option value="">Tất cả</option>
            {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <div className="flex gap-1.5"><Button type="submit" variant="soft" size="md">Lọc</Button>{filtering && <LinkButton href={`/reports?tab=${tab}`} variant="ghost" size="md">Xóa lọc</LinkButton>}</div>
      </form>

      <div className="mt-3.5 grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <Tile label="Lead" value={formatNumber(totals.leads)} />
        <Tile label="Đơn đã thanh toán" value={formatNumber(totals.orders)} />
        <Tile label="Doanh thu" value={formatCurrency(totals.revenue)} />
        <Tile label="Chi phí" value={formatCurrency(totals.spent)} hint={totals.spent > 0 && totals.revenue > 0 ? `ROAS ${(totals.revenue / totals.spent).toFixed(2)}x` : "ROAS: chưa đủ dữ liệu"} />
      </div>
      {sampleCount > 0 && <p className="mt-2 text-[12px] text-ink-3">{sampleCount} chiến dịch đang dùng số liệu mẫu vì chưa có lead, đơn hoặc chi phí thật. Số sẽ tự thay khi có dữ liệu.</p>}

      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2">
        <div className="overflow-x-auto"><Segment basePath={`/reports${f.month || f.campaignId ? `?${new URLSearchParams({ ...(f.month ? { month: f.month } : {}), ...(f.campaignId ? { campaign: f.campaignId } : {}) }).toString()}` : ""}`} active={tab} items={tabs} /></div>
        <a href={`/api/export/report?${new URLSearchParams({ tab, ...(f.month ? { month: f.month } : {}), ...(f.campaignId ? { campaign: f.campaignId } : {}) }).toString()}`} className="inline-flex h-7 items-center rounded-full border border-border-2 px-3 text-[12px] font-medium text-ink hover:bg-ground-2" title="Tệp CSV mở bằng Excel, cần quyền Quản lý">Tải CSV tab này</a>
      </div>

      {tab === "overview" && (
        <Panel>
          <PanelHeader title="Mục tiêu chung so với kết quả" sub="Mỗi chiến dịch: mức hoàn thành mục tiêu, lead, đơn, doanh thu, chi phí, ROAS." />
          {rows.length === 0 ? <EmptyState title="Không có chiến dịch trong phạm vi lọc" /> : (
            <Table>
              <thead><tr><Th>Chiến dịch</Th><Th>Mục tiêu</Th><Th right>Lead</Th><Th right>Đơn</Th><Th right>Doanh thu</Th><Th right>Chi phí</Th><Th right>CPL</Th><Th right>ROAS</Th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <Td><Link href={`/campaigns/${r.id}?tab=results`} className="font-semibold text-ink hover:underline">{r.name}</Link><div className="mt-1"><CampaignStatusPill status={r.status} /></div></Td>
                    <Td>
                      <div className="text-[12px] text-ink-2">{r.objective}</div>
                      <div className="mt-1 flex items-center gap-2"><ProgressBar value={r.progress} className="w-[120px]" label={`Tiến độ ${r.name}`} /><span className="num text-[12px] font-semibold text-ink">{r.progress}%</span>{r.targetValue ? <span className="num text-[11px] text-ink-3">{formatNumber(r.achieved)}/{formatNumber(r.targetValue)} {r.targetMetric}</span> : null}</div>
                    </Td>
                    <Td right className="num">{formatNumber(r.leads)}</Td>
                    <Td right className="num">{formatNumber(r.orders)}</Td>
                    <Td right className="num">{formatCurrency(r.revenue)}</Td>
                    <Td right className="num">{formatCurrency(r.spent)}<div className="text-[11px] text-ink-3">/ {formatCurrency(r.budget)}</div></Td>
                    <Td right className="num">{r.cpl ? formatCurrency(r.cpl) : "—"}</Td>
                    <Td right className={cn("num font-semibold", r.roas === null ? "text-ink-3" : r.roas >= 1 ? "text-jade" : "text-amber")}>{r.roas === null ? "—" : `${r.roas}x`}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Panel>
      )}

      {tab === "channels" && (
        <Panel>
          <PanelHeader title="Hiệu quả từng kênh" sub="Gộp mục tiêu kênh của các chiến dịch theo chỉ số chính phổ biến của kênh. Chi phí và lead theo mục tiêu kênh đã gắn." />
          {channelRows(f).length === 0 ? <EmptyState title="Chưa có mục tiêu kênh trong phạm vi lọc" /> : (
            <Table>
              <thead><tr><Th>Kênh</Th><Th>Chỉ số</Th><Th right>Chỉ tiêu</Th><Th right>Thực tế</Th><Th right>Hoàn thành</Th><Th right>Lead</Th><Th right>Chi phí / ngân sách</Th></tr></thead>
              <tbody>
                {channelRows(f).map((c) => (
                  <tr key={c.channel}>
                    <Td className="font-semibold text-ink">{c.label}<div className="text-[11px] font-normal text-ink-3">{c.goals} mục tiêu · {c.campaigns} chiến dịch</div></Td>
                    <Td>{c.metricLabel}</Td>
                    <Td right className="num">{formatNumber(c.target)}</Td>
                    <Td right className="num">{formatNumber(c.current)}</Td>
                    <Td right className={cn("num font-semibold", c.progress >= 100 ? "text-jade" : c.progress < 30 ? "text-amber" : "text-ink")}>{c.progress}%</Td>
                    <Td right className="num">{formatNumber(c.leads)}</Td>
                    <Td right className="num">{formatCurrency(c.spent)} / {formatCurrency(c.budget)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Panel>
      )}

      {tab === "content" && (
        <>
          <Panel>
            <PanelHeader title="Hiệu quả nội dung đã đăng" sub="Reach và tương tác theo bài (gộp các kênh). Số liệu đến từ nền tảng khi đã kết nối." />
            {contentRows(f).length === 0 ? <EmptyState title="Chưa có bài đăng có số liệu" /> : (
              <Table>
                <thead><tr><Th>Bài</Th><Th>Kênh</Th><Th>Chiến dịch</Th><Th right>Lượt đăng</Th><Th right>Reach</Th><Th right>Tương tác</Th><Th right>Tỷ lệ</Th></tr></thead>
                <tbody>
                  {contentRows(f).map((r) => (
                    <tr key={r.contentId}>
                      <Td className="font-semibold text-ink"><Link href={`/content?tab=done&open=${r.contentId}`} className="hover:underline">{r.title}</Link></Td>
                      <Td>{r.platforms.map((p) => platformLabel(p as Platform)).join(", ")}</Td>
                      <Td>{r.campaigns.length ? r.campaigns.map((c) => <Pill key={c} tone="jade" className="mr-1">{c}</Pill>) : <span className="text-ink-3">—</span>}</Td>
                      <Td right className="num">{r.posts}</Td>
                      <Td right className="num">{formatNumber(r.reach)}</Td>
                      <Td right className="num">{formatNumber(r.engagement)}</Td>
                      <Td right className={cn("num font-semibold", (r.rate ?? 0) >= 3 ? "text-jade" : "text-ink")}>{r.rate === null ? "—" : `${r.rate}%`}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Panel>
          <VideoPanel />
        </>
      )}

      {tab === "leads" && <LeadsPanel f={f} />}
      {tab === "orders" && <OrdersPanel f={f} />}
      {tab === "costs" && <CostsPanel f={f} />}
      <ModuleGroups moduleKey="reports" />
    </>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card px-3.5 py-2.5">
      <div className="text-[12px] font-medium text-ink-2">{label}</div>
      <div className="num text-[20px] font-bold leading-tight text-ink">{value}</div>
      {hint && <div className="text-[11.5px] text-ink-3">{hint}</div>}
    </div>
  );
}

function VideoPanel() {
  const v = videoSummary();
  return (
    <Panel>
      <PanelHeader title="Video" sub={`${v.total} video · ${v.editing} đang dựng · ${v.review} chờ kiểm tra · ${v.needsChanges} cần sửa · ${v.pending} chờ duyệt · ${v.approved} đã duyệt.`} />
      {v.approvedList.length === 0 ? <p className="px-4 py-3 text-[12.5px] text-ink-2">Chưa có video được phê duyệt. Hiệu quả lượt xem sẽ hiện khi kênh video được kết nối.</p> : (
        <ul className="m-0 list-none p-0">
          {v.approvedList.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2 text-[12.5px] last:border-b-0"><span className="font-semibold text-ink">{x.title}</span><span className="text-ink-2">bản {x.version} · {x.platforms.join(", ")}</span><Pill tone="jade">Đã duyệt</Pill></li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function LeadsPanel({ f }: { f: ReportFilter }) {
  const s = leadSummary(f);
  const bar = (n: number) => (s.total ? Math.round((n / s.total) * 100) : 0);
  return (
    <>
      <Panel>
        <PanelHeader title="Lead theo giai đoạn" sub={`${s.total} lead · ${s.won} đã mua · tỷ lệ chốt ${s.total ? Math.round((s.won / s.total) * 100) : 0}%.`} />
        <ul className="m-0 list-none p-0">
          {s.byStage.map((x) => (
            <li key={x.stage} className="grid grid-cols-[140px_1fr_60px] items-center gap-3 border-b border-border px-4 py-2 text-[12.5px] last:border-b-0"><span className="text-ink">{leadStageLabel[x.stage as LeadStage]?.label ?? x.stage}</span><ProgressBar value={bar(x.n)} label={x.stage} /><span className="num text-right font-semibold text-ink">{x.n}</span></li>
          ))}
          {s.byStage.length === 0 && <li className="px-4 py-6 text-center text-[12.5px] text-ink-2">Chưa có lead.</li>}
        </ul>
      </Panel>
      <div className="grid gap-3.5 md:grid-cols-2">
        <Panel className="mt-3.5">
          <PanelHeader title="Theo nguồn và nền tảng" />
          <ul className="m-0 list-none p-0">
            {s.bySource.map((x) => <li key={x.source} className="flex justify-between border-b border-border px-4 py-2 text-[12.5px] last:border-b-0"><span>{leadSourceLabel[x.source] ?? x.source}</span><span className="num font-semibold text-ink">{x.n}</span></li>)}
            {s.byPlatform.map((x) => <li key={x.platform} className="flex justify-between border-b border-border px-4 py-2 text-[12.5px] last:border-b-0"><span className="text-ink-2">{platformLabel(x.platform as Platform)}</span><span className="num text-ink">{x.n}</span></li>)}
          </ul>
        </Panel>
        <Panel className="mt-3.5">
          <PanelHeader title="Theo chiến dịch" sub="Lead gắn chiến dịch qua quảng cáo, bài đăng, form hoặc gắn tay." />
          <ul className="m-0 list-none p-0">
            {s.byCampaign.map((x) => <li key={x.campaign} className="flex justify-between gap-3 border-b border-border px-4 py-2 text-[12.5px] last:border-b-0"><span className="min-w-0 truncate">{x.campaign}</span><span className="num shrink-0 text-ink">{x.n} lead · {x.won} mua</span></li>)}
          </ul>
        </Panel>
      </div>
    </>
  );
}

function OrdersPanel({ f }: { f: ReportFilter }) {
  const s = orderSummary(f);
  return (
    <>
      <div className="mt-3.5 grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <Tile label="Đơn đã thanh toán" value={formatNumber(s.paid)} hint={`${s.pending} chờ thanh toán`} />
        <Tile label="Doanh thu" value={formatCurrency(s.revenue)} />
        <Tile label="Giá trị đơn trung bình" value={formatCurrency(s.aov)} />
        <Tile label="Tổng đơn" value={formatNumber(s.orders)} />
      </div>
      <div className="grid gap-3.5 md:grid-cols-2">
        <Panel>
          <PanelHeader title="Doanh thu theo sản phẩm" sub="Chỉ đơn đã thanh toán; giá theo danh mục tại thời điểm bán." />
          <ul className="m-0 list-none p-0">
            {s.byProduct.map((x) => <li key={x.name} className="flex justify-between gap-3 border-b border-border px-4 py-2 text-[12.5px] last:border-b-0"><span>{x.name} <span className="num text-ink-3">× {x.n}</span></span><span className="num font-semibold text-ink">{formatCurrency(x.revenue)}</span></li>)}
            {s.byProduct.length === 0 && <li className="px-4 py-6 text-center text-[12.5px] text-ink-2">Chưa có đơn đã thanh toán.</li>}
          </ul>
        </Panel>
        <Panel>
          <PanelHeader title="Doanh thu theo chiến dịch" />
          <ul className="m-0 list-none p-0">
            {s.byCampaign.map((x) => <li key={x.name} className="flex justify-between gap-3 border-b border-border px-4 py-2 text-[12.5px] last:border-b-0"><span className="min-w-0 truncate">{x.name}</span><span className="num font-semibold text-ink">{formatCurrency(x.revenue)}</span></li>)}
            {s.byCampaign.length === 0 && <li className="px-4 py-6 text-center text-[12.5px] text-ink-2">Chưa có đơn đã thanh toán.</li>}
          </ul>
        </Panel>
      </div>
    </>
  );
}

function CostsPanel({ f }: { f: ReportFilter }) {
  const s = costSummary(f);
  const r = s.spent > 0 && s.revenue > 0 ? (s.revenue / s.spent).toFixed(2) : null;
  return (
    <>
      <div className="mt-3.5 grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <Tile label="Ngân sách chiến dịch" value={formatCurrency(s.budget)} />
        <Tile label="Đã chi (kênh)" value={formatCurrency(s.spent)} hint={`Quảng cáo ${formatCurrency(s.adSpent)}`} />
        <Tile label="Chi phí AI tháng này" value={formatCurrency(s.aiMonth)} hint={`trần ${formatCurrency(s.aiCap)}`} />
        <Tile label="ROAS tổng" value={r ? `${r}x` : "—"} hint={r ? "doanh thu / chi phí" : "chưa đủ dữ liệu"} />
      </div>
      <Panel>
        <PanelHeader title="Chi phí và ROAS theo chiến dịch" sub="ROAS chỉ tính khi có cả doanh thu và chi phí." />
        <Table>
          <thead><tr><Th>Chiến dịch</Th><Th right>Ngân sách</Th><Th right>Đã chi</Th><Th right>Doanh thu</Th><Th right>ROAS</Th></tr></thead>
          <tbody>
            {s.byCampaign.map((x) => (
              <tr key={x.name}><Td className="font-semibold text-ink">{x.name}</Td><Td right className="num">{formatCurrency(x.budget)}</Td><Td right className="num">{formatCurrency(x.spent)}</Td><Td right className="num">{formatCurrency(x.revenue)}</Td><Td right className={cn("num font-semibold", x.roas === null ? "text-ink-3" : x.roas >= 1 ? "text-jade" : "text-amber")}>{x.roas === null ? "—" : `${x.roas}x`}</Td></tr>
            ))}
          </tbody>
        </Table>
      </Panel>
    </>
  );
}
