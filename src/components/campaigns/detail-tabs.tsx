import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { channelLabel, executionLabel, metricLabel, metricUnit, channelDef } from "@/config/channels";
import { Panel, PanelHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Pill } from "@/components/ui/pill";
import { LinkButton } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress";
import { Table, Th, Td } from "@/components/ui/table";
import { inputClass } from "@/components/ui/field";
import { campaignRepo, type ResolvedLink } from "@/lib/campaigns/repository";
import { approvalTypeLabel, entityTypeLabel } from "@/lib/campaigns/labels";
import { entityHref } from "@/lib/campaigns/context";
import { campaignProgress, checkBudget, conversionRate, costPerLead, goalProgress, roas } from "@/lib/campaigns/results";
import type { Campaign, CampaignApproval, CampaignLog, CampaignResult, ChannelGoal, LinkedEntityType, Person, PlatformAccount, Product } from "@/lib/campaigns/types";
import { pauseChannelGoal, resumeChannelGoal } from "@/lib/actions/campaigns";
import { formatCurrency, formatDate, formatDateTime, formatNumber, cn } from "@/lib/format";
import { AccountPill, ApprovalStatusPill, GoalStatusPill } from "./status";
import { GoalForm } from "./goal-form";
import { ConfirmAction } from "./confirm-action";

const personName = (people: Person[], id: string | null) => people.find((p) => p.id === id)?.name ?? "Chưa phân công";

// ---------- Tab 1: Tổng quan ----------
export function OverviewTab({ campaign, goals, result, people, products, alerts, logs }: { campaign: Campaign; goals: ChannelGoal[]; result: CampaignResult | null; people: Person[]; products: Product[]; alerts: string[]; logs: CampaignLog[] }) {
  const progress = campaignProgress(campaign, goals, result);
  const budget = checkBudget(campaign.totalBudget, goals);
  const spent = goals.reduce((n, g) => n + g.spent, 0);
  return (
    <div className="mt-3.5 grid gap-3.5 lg:grid-cols-[3fr_2fr] lg:items-start">
      <div className="grid gap-3.5">
        <Panel className="mt-0">
          <PanelHeader title="Mục tiêu chung" sub="Mọi mục tiêu kênh, nội dung, video, quảng cáo và lead đều phục vụ mục tiêu này." />
          <div className="px-4 py-3">
            <p className="text-[14px] font-semibold text-ink">{campaign.objective}</p>
            {campaign.description && <p className="mt-1 text-[12.5px] text-ink-2">{campaign.description}</p>}
            <div className="mt-3 flex items-center justify-between text-[12px] text-ink-2">
              <span>Tiến độ chung{campaign.targetValue ? ` · ${formatNumber(result?.achievedValue ?? 0)} / ${formatNumber(campaign.targetValue)} ${campaign.targetMetric}` : " · trung bình các kênh"}</span>
              <span className="num font-semibold text-ink">{progress}%</span>
            </div>
            <ProgressBar value={progress} className="mt-1" label="Tiến độ chung" />
          </div>
          <dl className="grid gap-x-6 gap-y-2.5 border-t border-border px-4 py-3 text-[13px] sm:grid-cols-2">
            <Info label="Sản phẩm / dịch vụ" value={campaign.productIds.map((id) => products.find((p) => p.id === id)).filter(Boolean).map((p) => `${p!.name}${p!.price ? ` (${formatCurrency(p!.price)})` : ""}`).join(", ") || "—"} />
            <Info label="Khách hàng mục tiêu" value={campaign.audience || "—"} />
            <Info label="Khu vực" value={campaign.location || "—"} />
            <Info label="Thời gian" value={`${formatDate(campaign.startDate)} – ${formatDate(campaign.endDate)}`} />
            <Info label="Ngân sách" value={`${formatCurrency(campaign.totalBudget)} tổng · đã phân bổ ${formatCurrency(budget.allocated)} · đã chi ${formatCurrency(spent)}`} />
            <Info label="Người phụ trách" value={`${personName(people, campaign.ownerId)} · tạo bởi ${campaign.createdBy}`} />
            {campaign.budgetNote && <Info label="Ghi chú ngân sách" value={campaign.budgetNote} />}
            {campaign.approvedAt && <Info label="Phê duyệt" value={`${campaign.approvedBy ?? "—"} · ${formatDateTime(campaign.approvedAt)}`} />}
          </dl>
        </Panel>

        <Panel className="mt-0">
          <PanelHeader title="Kênh đang dùng" sub={`${goals.length} mục tiêu kênh · mở tab “Mục tiêu theo kênh” để chỉnh sửa.`} />
          {goals.length === 0 ? (
            <EmptyState title="Chưa có mục tiêu kênh" />
          ) : (
            <ul className="m-0 list-none p-0">
              {goals.map((g) => (
                <li key={g.id} className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-border px-4 py-2.5 last:border-b-0">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-[13px]"><span className="font-semibold text-ink">{channelLabel(g.channel)}</span><GoalStatusPill status={g.status} /></div>
                    <div className="mt-0.5 truncate text-[12px] text-ink-2">{g.objective}</div>
                  </div>
                  <div className="num text-right text-[12px] text-ink-2">
                    <div className="font-semibold text-ink">{goalProgress(g)}%</div>
                    <div>{formatNumber(g.currentValue)} / {formatNumber(g.targetValue)} {metricUnit(g.primaryMetric)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid gap-3.5">
        <Panel className="mt-0">
          <PanelHeader title="Cảnh báo" sub={alerts.length ? `${alerts.length} việc cần người xử lý.` : "Không có cảnh báo."} />
          {alerts.length > 0 && (
            <ul className="m-0 list-none p-0">
              {alerts.map((a) => (
                <li key={a} className="flex gap-2 border-b border-border px-4 py-2.5 text-[12.5px] text-ink last:border-b-0"><AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber" aria-hidden />{a}</li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel className="mt-0">
          <PanelHeader title="Nhật ký" sub="Mọi hành động quan trọng đều được ghi lại." />
          {logs.length === 0 ? (
            <EmptyState title="Chưa có nhật ký" />
          ) : (
            <ul className="m-0 list-none p-0">
              {logs.map((l) => (
                <li key={l.id} className="border-b border-border px-4 py-2.5 text-[12.5px] last:border-b-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-2"><span className="font-semibold text-ink">{l.action}</span><time className="num text-[11px] text-ink-3">{formatDateTime(l.at)}</time></div>
                  <div className="text-ink-2">{l.actor}{l.detail ? ` · ${l.detail}` : ""}</div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="lbl">{label}</dt>
      <dd className="mt-0.5 text-ink">{value}</dd>
    </div>
  );
}

// ---------- Tab 2: Mục tiêu theo kênh ----------
export function GoalsTab({ campaign, goals, people, accounts, add, edit, idem }: { campaign: Campaign; goals: ChannelGoal[]; people: Person[]; accounts: PlatformAccount[]; add: boolean; edit?: string; idem: string }) {
  const budget = checkBudget(campaign.totalBudget, goals);
  const accountOf = (g: ChannelGoal) => accounts.find((a) => a.key === (g.accountId ?? channelDef(g.channel)?.integrationKey));
  const canEdit = campaign.status !== "ended";
  return (
    <Panel>
      <PanelHeader
        title="Mục tiêu theo kênh"
        sub={`Ngân sách kênh ${formatCurrency(budget.allocated)} / ${formatCurrency(budget.total)}${budget.over ? " — vượt ngân sách tổng" : ""}.`}
        action={canEdit && !add ? <LinkButton href={`/campaigns/${campaign.id}?tab=goals&add=1`} variant="primary">Thêm mục tiêu kênh</LinkButton> : undefined}
      />
      {budget.over && <p className="border-b border-border bg-brick-soft px-4 py-2 text-[12.5px] font-medium text-brick">Ngân sách kênh vượt ngân sách tổng {formatCurrency(budget.allocated - budget.total)}. Giảm ngân sách một kênh hoặc điều chỉnh ngân sách chiến dịch.</p>}
      {add && canEdit && <GoalForm campaign={campaign} people={people} accounts={accounts} idem={idem} />}
      {goals.length === 0 && !add ? (
        <EmptyState title="Chưa có mục tiêu kênh" hint="Mỗi kênh cần một mục tiêu riêng để nội dung, quảng cáo và lead có chỗ gắn vào." action={canEdit ? <LinkButton href={`/campaigns/${campaign.id}?tab=goals&add=1`} variant="primary">Thêm mục tiêu kênh</LinkButton> : undefined} />
      ) : (
        <ul className="m-0 list-none p-0">
          {goals.map((g) => {
            const acc = accountOf(g);
            const editing = edit === g.id;
            return (
              <li key={g.id} className={cn("border-b border-border last:border-b-0", editing && "bg-jade-soft/20")}>
                <div className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_auto] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13.5px] font-semibold text-ink">{channelLabel(g.channel)}</span>
                      <GoalStatusPill status={g.status} />
                      <Pill>{executionLabel(g.executionType)}</Pill>
                      {acc ? <AccountPill connected={acc.connected} name={acc.account ?? acc.name} /> : <Pill tone="amber">Chưa chọn tài khoản</Pill>}
                    </div>
                    <div className="mt-1 text-[12.5px] text-ink">{g.objective}</div>
                    <div className="mt-1 text-[12px] text-ink-2">{personName(people, g.ownerId)} · {formatDate(g.startDate)} – {formatDate(g.endDate)} · Ngân sách <span className="num">{formatCurrency(g.budget)}</span>{g.spent ? <> · đã chi <span className="num">{formatCurrency(g.spent)}</span></> : null}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center justify-between text-[12px] text-ink-2">
                      <span>{metricLabel(g.primaryMetric)}: <b className="num text-ink">{formatNumber(g.currentValue)}</b> / <span className="num">{formatNumber(g.targetValue)}</span> {metricUnit(g.primaryMetric)}</span>
                      <span className="num font-semibold text-ink">{goalProgress(g)}%</span>
                    </div>
                    <ProgressBar value={goalProgress(g)} className="mt-1" label={`Tiến độ ${channelLabel(g.channel)}`} muted={g.status === "planned"} />
                  </div>
                  {canEdit && (
                    <div className="flex flex-wrap gap-1.5 lg:justify-end">
                      {!editing && <LinkButton href={`/campaigns/${campaign.id}?tab=goals&edit=${g.id}`}>Sửa</LinkButton>}
                      {(g.status === "active" || g.status === "planned") && (
                        <ConfirmAction action={pauseChannelGoal} fields={{ goalId: g.id, idem: `${idem}_pause_${g.id}` }} label="Tạm dừng" title={`Tạm dừng mục tiêu ${channelLabel(g.channel)}?`} message="Nội dung và quảng cáo thuộc mục tiêu này sẽ không được đẩy tiếp cho tới khi chạy lại. Lead đã có vẫn được chăm sóc." confirmLabel="Tạm dừng" variant="ghost" />
                      )}
                      {g.status === "paused" && (
                        <ConfirmAction action={resumeChannelGoal} fields={{ goalId: g.id, idem: `${idem}_resume_${g.id}` }} label="Chạy lại" title={`Chạy lại mục tiêu ${channelLabel(g.channel)}?`} message="Mục tiêu kênh trở lại trạng thái đang chạy. Bài đăng và quảng cáo vẫn cần phê duyệt riêng." confirmLabel="Chạy lại" variant="soft" />
                      )}
                    </div>
                  )}
                </div>
                {editing && canEdit && <GoalForm campaign={campaign} goal={g} people={people} accounts={accounts} idem={idem} />}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

// ---------- Tab 3: Hoạt động thực hiện ----------
const activityGroups: { key: string; title: string; type: LinkedEntityType; match: (r: ResolvedLink) => boolean }[] = [
  { key: "insight", title: "Insight đang nghiên cứu", type: "insight", match: (r) => r.link.entityType === "insight" },
  { key: "writing", title: "Nội dung đang viết", type: "content", match: (r) => r.link.entityType === "content" && r.entityStatus !== "review" },
  { key: "video", title: "Video đang dựng", type: "video", match: (r) => r.link.entityType === "video" },
  { key: "review", title: "Nội dung chờ duyệt", type: "content", match: (r) => r.link.entityType === "content" && r.entityStatus === "review" },
  { key: "publication", title: "Bài đang chờ đăng", type: "publication", match: (r) => r.link.entityType === "publication" },
  { key: "ad", title: "Quảng cáo", type: "ad", match: (r) => r.link.entityType === "ad" },
  { key: "lead", title: "Lead đang chăm sóc", type: "lead", match: (r) => r.link.entityType === "lead" },
];

export function ActivityTab({ campaign, goals, goalFilter }: { campaign: Campaign; goals: ChannelGoal[]; goalFilter: string | null }) {
  const links = campaignRepo.links(campaign.id, goalFilter);
  const resolved = campaignRepo.resolveLinks(links);
  const goalName = (id: string | null) => {
    const g = goals.find((x) => x.id === id);
    return g ? channelLabel(g.channel) : null;
  };
  return (
    <>
      <div className="mt-3.5 flex flex-wrap items-center gap-2">
        <form method="get" action={`/campaigns/${campaign.id}`} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="tab" value="activity" />
          <label className="text-[12.5px] text-ink-2">
            Lọc theo mục tiêu kênh{" "}
            <select name="goal" defaultValue={goalFilter ?? ""} className={`${inputClass} ml-1 inline-block h-7 w-auto text-[12px]`}>
              <option value="">Tất cả</option>
              {goals.map((g) => (
                <option key={g.id} value={g.id}>{channelLabel(g.channel)} · {g.objective}</option>
              ))}
            </select>
          </label>
          <button type="submit" className="cursor-pointer rounded-full border border-border-2 px-2.5 py-1 text-[12px] font-medium text-ink hover:border-ink-3">Áp dụng</button>
        </form>
        <span className="num ml-auto text-[12px] text-ink-3">{links.length} mục liên kết bằng campaign_id{goalFilter ? " + channel_goal_id" : ""}</span>
      </div>
      {resolved.length === 0 ? (
        <div className="card mt-3.5"><EmptyState title="Chưa có hoạt động liên kết" hint="Khi Insight, Nội dung, Video, Bài đăng hoặc Lead được gắn vào chiến dịch này, chúng sẽ hiện ở đây theo từng nhóm." /></div>
      ) : (
        activityGroups.map((grp) => {
          const items = resolved.filter(grp.match);
          if (items.length === 0) return null;
          return (
            <Panel key={grp.key}>
              <PanelHeader title={grp.title} sub={`${items.length} mục · mở ${entityTypeLabel[grp.type].module}`} />
              <ul className="m-0 list-none p-0">
                {items.map((r) => {
                  const gn = goalName(r.link.channelGoalId);
                  const href = entityHref(r.link.entityType, r.link.entityId, { campaignId: campaign.id, channelGoalId: r.link.channelGoalId }, r.entityStatus);
                  return (
                    <li key={r.link.id} className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-border px-4 py-2.5 last:border-b-0">
                      <div className="min-w-0">
                        <div className={cn("truncate text-[13px] font-semibold", r.found ? "text-ink" : "text-brick")}>{r.title}</div>
                        {r.sub && <div className="truncate text-[12px] text-ink-2">{r.sub}</div>}
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          <Pill tone={r.found ? "neutral" : "brick"}>{r.statusLabel}</Pill>
                          {gn && <Pill tone="jade">{gn}</Pill>}
                          {r.link.viaType && r.link.viaId && <Pill>từ {entityTypeLabel[r.link.viaType].label.toLowerCase()} {r.link.viaId}</Pill>}
                        </div>
                      </div>
                      <LinkButton href={href}>Mở {entityTypeLabel[grp.type].module}</LinkButton>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          );
        })
      )}
    </>
  );
}

// ---------- Tab 4: Chờ phê duyệt ----------
export function ApprovalsTab({ approvals, goals }: { approvals: CampaignApproval[]; goals: ChannelGoal[] }) {
  const pending = approvals.filter((a) => a.status === "pending");
  const decided = approvals.filter((a) => a.status !== "pending");
  const goalName = (id: string | null) => {
    const g = goals.find((x) => x.id === id);
    return g ? channelLabel(g.channel) : null;
  };
  const row = (a: CampaignApproval) => (
    <li key={a.id} className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-border px-4 py-2.5 last:border-b-0">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2"><Pill tone="neutral">{approvalTypeLabel[a.type]}</Pill>{goalName(a.channelGoalId) && <Pill tone="jade">{goalName(a.channelGoalId)}</Pill>}</div>
        <div className="mt-1 text-[13px] font-semibold text-ink">{a.title}</div>
        <div className="mt-0.5 text-[12px] text-ink-2">
          {a.requestedBy} · <span className="num">{formatDateTime(a.requestedAt)}</span>
          {a.note ? ` · ${a.note}` : ""}
          {a.decidedAt ? <> · quyết định bởi {a.decidedBy} lúc <span className="num">{formatDateTime(a.decidedAt)}</span></> : null}
        </div>
      </div>
      <ApprovalStatusPill status={a.status} />
    </li>
  );
  return (
    <>
      <Panel>
        <PanelHeader title="Chờ phê duyệt" sub={pending.length ? `${pending.length} việc đang chờ. AI chỉ đề xuất, không tự phê duyệt.` : "Không có việc nào chờ phê duyệt."} />
        {pending.length > 0 && <ul className="m-0 list-none p-0">{pending.map(row)}</ul>}
        {pending.length > 0 && <p className="border-t border-border px-4 py-2.5 text-[12px] text-ink-3">Phê duyệt chiến dịch bằng nút ở đầu trang. Nội dung, video, lịch đăng và quảng cáo được duyệt ở phân hệ tương ứng (giai đoạn này là trạng thái mẫu).</p>}
      </Panel>
      {decided.length > 0 && (
        <Panel>
          <PanelHeader title="Đã quyết định" sub={`${decided.length} yêu cầu.`} />
          <ul className="m-0 list-none p-0">{decided.map(row)}</ul>
        </Panel>
      )}
    </>
  );
}

// ---------- Tab 5: Kết quả ----------
export function ResultsTab({ campaign, goals, result }: { campaign: Campaign; goals: ChannelGoal[]; result: CampaignResult | null }) {
  const progress = campaignProgress(campaign, goals, result);
  const spent = result?.spent ?? goals.reduce((n, g) => n + g.spent, 0);
  const leads = result?.leads ?? 0;
  const orders = result?.orders ?? 0;
  const revenue = result?.revenue ?? 0;
  const conv = conversionRate(orders, leads);
  const r = roas(revenue, spent);
  const cpl = costPerLead(spent, leads);
  const hasAny = !!result || goals.some((g) => g.currentValue > 0);
  if (!hasAny) {
    return (
      <div className="card mt-3.5"><EmptyState title="Chưa có kết quả" hint="Kết quả xuất hiện khi mục tiêu kênh có số liệu từ bài đăng, quảng cáo, lead và đơn hàng." /></div>
    );
  }
  const rows: { label: string; value: string; note?: string }[] = [
    { label: "Lead", value: formatNumber(leads), note: cpl ? `Chi phí / lead ${formatCurrency(cpl)}` : undefined },
    { label: "Đơn hàng", value: formatNumber(orders) },
    { label: "Doanh thu", value: formatCurrency(revenue) },
    { label: "Chi phí", value: formatCurrency(spent), note: `Ngân sách ${formatCurrency(campaign.totalBudget)}` },
    { label: "Tỷ lệ chuyển đổi", value: conv === null ? "—" : `${conv}%`, note: conv === null ? "Chưa có lead" : "Đơn hàng / lead" },
    { label: "ROAS", value: r === null ? "—" : `${r}x`, note: r === null ? "Chưa đủ dữ liệu doanh thu và chi phí" : "Doanh thu / chi phí" },
  ];
  return (
    <>
      <Panel>
        <PanelHeader title="Mục tiêu chung so với kết quả" sub={result ? `Cập nhật ${formatDateTime(result.updatedAt)} · ${result.source === "sample" ? "số liệu mẫu" : "tổng hợp từ hệ thống"}.` : "Tổng hợp từ mục tiêu kênh."} />
        <div className="px-4 py-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-[13px]">
            <span className="font-semibold text-ink">{campaign.objective}</span>
            <span className="num text-ink-2">{campaign.targetValue ? `${formatNumber(result?.achievedValue ?? 0)} / ${formatNumber(campaign.targetValue)} ${campaign.targetMetric}` : "trung bình các kênh"} · <b className="text-ink">{progress}%</b></span>
          </div>
          <ProgressBar value={progress} className="mt-1.5" label="Mức hoàn thành mục tiêu chung" />
        </div>
        <dl className="grid grid-cols-2 gap-px border-t border-border bg-border md:grid-cols-3 lg:grid-cols-6">
          {rows.map((x) => (
            <div key={x.label} className="bg-surface px-4 py-3">
              <dt className="lbl">{x.label}</dt>
              <dd className="num mt-0.5 text-[16px] font-bold text-ink">{x.value}</dd>
              {x.note && <dd className="text-[11.5px] text-ink-3">{x.note}</dd>}
            </div>
          ))}
        </dl>
      </Panel>
      <Panel>
        <PanelHeader title="Kết quả từng kênh" sub="Chỉ tiêu đặt ra so với thực tế. Số liệu kênh sẽ do Đăng bài & Quảng cáo và Khách hàng cập nhật." />
        <Table>
          <thead>
            <tr><Th>Kênh</Th><Th>Chỉ số</Th><Th right>Chỉ tiêu</Th><Th right>Thực tế</Th><Th right>Hoàn thành</Th><Th right>Chi phí / ngân sách</Th></tr>
          </thead>
          <tbody>
            {goals.map((g) => {
              const p = goalProgress(g);
              return (
                <tr key={g.id}>
                  <Td className="font-semibold text-ink">{channelLabel(g.channel)}<div className="text-[11.5px] font-normal text-ink-2">{g.objective}</div></Td>
                  <Td>{metricLabel(g.primaryMetric)}</Td>
                  <Td right className="num">{formatNumber(g.targetValue)}</Td>
                  <Td right className="num">{formatNumber(g.currentValue)}</Td>
                  <Td right className={cn("num font-semibold", p >= 100 ? "text-jade" : p < 30 ? "text-amber" : "text-ink")}>{p}%</Td>
                  <Td right className="num">{formatCurrency(g.spent)} / {formatCurrency(g.budget)}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Panel>
      <p className="mt-3 text-[12px] text-ink-3">Hiệu quả từng nội dung và video sẽ hiện ở đây khi phân hệ Báo cáo được xây; hiện chỉ so sánh mục tiêu với kết quả ở cấp kênh. <Link href={`/campaigns/${campaign.id}?tab=activity`} className="text-jade hover:underline">Xem hoạt động thực hiện</Link>.</p>
    </>
  );
}
