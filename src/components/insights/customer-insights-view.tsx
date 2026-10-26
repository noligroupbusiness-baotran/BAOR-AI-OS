import Link from "next/link";
import { Panel, PanelHeader, Rows, Row } from "@/components/ui/card";
import { Pill, Score } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { aiGenerateIdeas } from "@/lib/actions/content";
import { aiExtractInsights, createInsight, decideInsight } from "@/lib/actions/insights";
import { Field, inputClass, textareaClass } from "@/components/ui/field";
import { LinkButton, buttonClass } from "@/components/ui/button";
import { SubmitButton } from "@/components/campaigns/submit-button";
import { EmptyState } from "@/components/ui/empty-state";
import { listInsights, listPersonas, listResearch } from "@/lib/queries";
import { formatDateTime } from "@/lib/format";
import { CampaignPicker } from "@/components/campaigns/campaign-context";
import { CampaignStatusPill } from "@/components/campaigns/status";
import { channelLabel } from "@/config/channels";
import { platformLabel } from "@/components/ui/platform";
import { CampaignTags, LinkToCampaignForm } from "@/components/campaigns/entity-campaign";
import { campaignRepo } from "@/lib/campaigns/repository";
import { readCampaignContext, withCampaignContext, type CampaignContext } from "@/lib/campaigns/context";
import { CompetitorsPanel } from "@/components/insights/competitors-panel";
import { SamplePill } from "@/components/ui/sample";
import { isSample } from "@/lib/sample";
import type { Platform } from "@/lib/types";
import { ChevronDown, Megaphone, Sparkles, Wand2, Plus, X } from "lucide-react";

// Bước 1 · Chủ đề & insight › tab "Insight" (OWNER 26/10/2026 gộp trang /insights cũ vào đây): chân dung, nỗi đau, đối thủ, xu hướng,
// insight AI đề xuất / đang dùng. /insights cũ chuyển hướng sang /insights/research?tab=insight.
export const INSIGHT_TAB = "/insights/research?tab=insight";

export function CustomerInsightsView({ sp }: { sp: { campaign?: string; goal?: string; link?: string; add?: string; competitor?: string } }) {
  const allInsights = listInsights();
  const proposed = allInsights.filter((i) => i.status === "proposed");
  const rejected = allInsights.filter((i) => i.status === "rejected").length;
  const ctx = readCampaignContext(sp);
  const campaign = ctx.campaignId ? campaignRepo.get(ctx.campaignId) : undefined;
  const linkedIds = campaign ? new Set(campaignRepo.links(campaign.id, ctx.channelGoalId).filter((l) => l.entityType === "insight").map((l) => l.entityId)) : null;
  const research = listResearch();
  const insights = allInsights.filter((i) => i.status === "approved").filter((i) => (linkedIds ? linkedIds.has(i.id) : true));
  const personas = listPersonas();
  const links = campaignRepo.linksForEntities("insight", insights.map((i) => i.id));
  const back = withCampaignContext(`${INSIGHT_TAB}#insights`, ctx);

  return (
    <>
      {/* Thanh công cụ gọn (OWNER 27/10/2026 "insight hơi rườm rà, tối giản lại"): 1 nút chính + 2 nút phụ + chọn chiến dịch thu gọn. */}
      <div className="mt-3.5 flex flex-wrap items-center gap-2">
        <form action={aiGenerateIdeas}>
          <Button variant="primary" size="md" type="submit" icon={Sparkles}>Sinh ý tưởng</Button>
        </form>
        <form action={aiExtractInsights}>
          <Button size="md" type="submit" variant="outline" icon={Wand2} aria-label={proposed.length > 0 ? `AI rút insight · ${proposed.length} chờ duyệt` : undefined}>
            AI rút insight
            {proposed.length > 0 && <span className="num -ml-0.5 inline-grid h-[18px] min-w-[18px] place-items-center rounded-full bg-amber-soft px-1 text-[11px] font-semibold text-amber" aria-hidden>{proposed.length}</span>}
          </Button>
        </form>
        <LinkButton href={`${INSIGHT_TAB}&add=1#add`} size="md" variant="ghost" icon={Plus}>Thêm insight</LinkButton>
        <InfoTip label="Giải thích: insight">
          <b className="text-ink">AI rút insight</b> đọc inbox, lead, bài đăng rồi đề xuất insight kèm bằng chứng. Duyệt thì mới được dùng để sinh nội dung.
          {rejected > 0 && <> {rejected} đề xuất đã từ chối.</>}
        </InfoTip>
        <div className="ml-auto min-w-0 max-w-full">
          <CampaignControl ctx={ctx} campaign={campaign} filtered={!!linkedIds} />
        </div>
      </div>

      {sp.add === "1" && (
        <Panel id="add">
          <PanelHeader title="Thêm insight" info="Từ khảo sát, quan sát tại quầy, phản hồi trực tiếp. Ghi rõ nguồn để người khác kiểm chứng." />
          <form action={createInsight} className="grid gap-3 p-4 md:grid-cols-2">
            <Field label="Insight" required className="md:col-span-2"><input name="title" required className={inputClass} placeholder="VD: Khách văn phòng muốn dịch vụ dưới 45 phút" /></Field>
            <Field label="Chi tiết" className="md:col-span-2"><textarea name="detail" rows={2} className={textareaClass} /></Field>
            <Field label="Nguồn phát hiện" required><input name="source" required className={inputClass} placeholder="VD: Khảo sát 120 khách tại quầy" /></Field>
            <Field label="Độ tin cậy (%)"><input name="confidence" inputMode="numeric" defaultValue={70} className={inputClass} /></Field>
            <Field label="Bằng chứng / trích dẫn" className="md:col-span-2"><input name="evidence" className={inputClass} placeholder="VD: 71% chọn dịch vụ dưới 45 phút" /></Field>
            <Field label="Nhóm khách hàng">
              <select name="personaId" defaultValue="" className={inputClass}><option value="">Chưa gắn</option>{personas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            </Field>
            <div className="flex gap-2 md:col-span-2"><SubmitButton pendingText="Đang lưu…">Thêm insight</SubmitButton><LinkButton href={INSIGHT_TAB} variant="ghost">Hủy</LinkButton></div>
          </form>
        </Panel>
      )}

      {proposed.length > 0 && (
        <Panel id="proposed">
          <PanelHeader title="Insight AI đề xuất, chờ duyệt" tags={<Pill tone="amber" className="num">{proposed.length}</Pill>} info="Mỗi insight kèm nguồn và bằng chứng. Duyệt thì mới được dùng để sinh nội dung." />
          <ul className="m-0 list-none p-0">
            {proposed.map((i) => (
              <li key={i.id} className="grid gap-2 border-b border-border px-4 py-3 last:border-b-0 md:grid-cols-[1fr_auto] md:items-start">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><Score value={i.confidence} /><span className="font-semibold text-ink">{i.title}</span><Pill tone="amber">AI đề xuất</Pill></div>
                  <p className="mt-1 text-[12.5px] text-ink-2">{i.detail}</p>
                  <div className="mt-1 text-[12px] text-ink-3">Nguồn: {i.source}{i.evidence.length ? ` · Bằng chứng: ${i.evidence.slice(0, 4).join("; ")}` : ""}</div>
                </div>
                <div className="flex gap-1.5">
                  <form action={decideInsight}><input type="hidden" name="id" value={i.id} /><input type="hidden" name="decision" value="approve" /><SubmitButton>Duyệt</SubmitButton></form>
                  <form action={decideInsight}><input type="hidden" name="id" value={i.id} /><input type="hidden" name="decision" value="reject" /><SubmitButton variant="ghost">Từ chối</SubmitButton></form>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel id="channels">
        <PanelHeader title="Kênh phù hợp" info={<>Chấm % theo mức khớp với khách hàng mục tiêu; giờ vàng là khung giờ đăng gợi ý. Cập nhật {research[0] ? formatDateTime(research[0].updatedAt) : "—"}.</>} />
        {research.length === 0 ? (
          <EmptyState title="Chưa có dữ liệu kênh" />
        ) : (
          <ul className="m-0 -mb-px grid list-none p-0 sm:-mr-px sm:grid-cols-2 xl:grid-cols-3">
            {research.map((r) => {
              const trends = r.trendingTopics.slice(0, 3).join(" · ");
              return (
                <li key={r.id} className="min-w-0 border-b border-border px-4 py-3 sm:border-r">
                  <div className="flex items-center gap-2.5">
                    <PlatformBadge platform={r.platform} />
                    <span className="min-w-0 flex-1 truncate font-semibold text-ink">{r.name}</span>
                    <Pill tone={r.audienceFit >= 80 ? "jade" : r.audienceFit >= 70 ? "amber" : "neutral"} className="num">{r.audienceFit}%</Pill>
                  </div>
                  {r.bestPostingTimes.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1" aria-label="Giờ vàng">
                      {r.bestPostingTimes.map((t) => <span key={t} className="num rounded border border-border px-1.5 py-px text-[11px] text-ink-2">{t}</span>)}
                    </div>
                  )}
                  {trends && <div className="mt-1.5 truncate text-[12px] text-ink-3" title={`Đang lên: ${r.trendingTopics.join(" · ")}`}>{trends}</div>}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <CompetitorsPanel editing={sp.competitor} />

      <Panel id="personas">
        <PanelHeader title="Chân dung khách hàng" info="Tỷ lệ trong tập khách và nỗi đau chính." />
        <Rows>
          {personas.map((p) => (
            <Row
              key={p.id}
              lead={<Pill tone="jade" className="num">{p.share}%</Pill>}
              title={<>{p.name}{isSample("persona", p.id) && <span className="ml-1.5 align-middle"><SamplePill /></span>}</>}
              sub={`${p.ageRange} tuổi · ${p.occupation} · ${p.location}`}
              extra={<div className="mt-1 text-[12px] text-ink-2">Nỗi đau: {p.painPoints.join(" · ")}</div>}
            />
          ))}
        </Rows>
      </Panel>

      <Panel id="insights">
        <PanelHeader title="Insight đang dùng" tags={insights.length > 0 ? <Pill className="num">{insights.length}</Pill> : undefined} info="Xếp theo độ tin cậy. Mỗi insight gắn với chiến dịch, mục tiêu kênh, nhóm khách và nguồn phát hiện." />
        <Rows>
          {insights.length === 0 && <li className="px-4 py-2"><EmptyState title={linkedIds ? "Chiến dịch này chưa gắn insight nào" : "Chưa có insight đã duyệt"} /></li>}
          {insights.map((i, idx) => {
            const persona = personas.find((p) => p.id === i.personaId);
            return (
              <Row
                key={i.id}
                lead={
                  <span className="flex items-center gap-3">
                    <span className="w-3 text-[12px] font-semibold text-ink-3">{idx + 1}</span>
                    <Score value={i.confidence} />
                  </span>
                }
                title={i.title}
                sub={i.detail}
                extra={
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {isSample("insight", i.id) && <SamplePill title="Insight mẫu (dữ liệu demo): số liệu không phải số thật" />}
                    {persona && <Pill>{persona.name.split(" – ")[1] ?? persona.name}</Pill>}
                    <Pill>{i.source}</Pill>
                    {i.origin === "ai" && <Pill tone="amber">AI, đã duyệt</Pill>}
                    {i.origin === "manual" && <Pill>Nhập tay</Pill>}
                    <CampaignTags links={links.get(i.id)} />
                    <LinkToCampaignForm entityType="insight" entityId={i.id} status="active" back={back} links={links.get(i.id)} compact open={sp.link === i.id} />
                  </div>
                }
              />
            );
          })}
        </Rows>
      </Panel>
    </>
  );
}

// Huy hiệu kênh: chữ viết tắt trên chip màu (lucide không có logo thương hiệu).
const PLATFORM_MARK: Partial<Record<string, { mark: string; tone: string }>> = {
  facebook: { mark: "f", tone: "tone-blue" },
  instagram: { mark: "IG", tone: "tone-pink" },
  tiktok: { mark: "TT", tone: "tone-slate" },
  threads: { mark: "@", tone: "tone-slate" },
  youtube: { mark: "YT", tone: "tone-red" },
  zalo: { mark: "Z", tone: "tone-cyan" },
};

function PlatformBadge({ platform }: { platform: string }) {
  const m = PLATFORM_MARK[platform] ?? PLATFORM_MARK[platform.split("_")[0]] ?? { mark: platformLabel(platform as Platform).slice(0, 2), tone: "tone-blue" };
  return <span className={`chip ${m.tone} h-7 w-7 text-[11px] font-bold`} title={platformLabel(platform as Platform)} aria-hidden>{m.mark}</span>;
}

// Chiến dịch thu gọn: đang có ngữ cảnh → chip tên + nút bỏ; chưa có → nút "Chiến dịch" mở bộ chọn (Áp dụng nằm trong menu).
function CampaignControl({ ctx, campaign, filtered }: { ctx: CampaignContext; campaign: ReturnType<typeof campaignRepo.get>; filtered: boolean }) {
  const clear = withCampaignContext(INSIGHT_TAB, {});
  if (ctx.campaignId && !campaign) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber/40 bg-amber-soft/40 py-px pl-3 pr-px text-[12px] text-ink">
        Không tìm thấy chiến dịch
        <LinkButton href={clear} variant="ghost" size="icon" aria-label="Bỏ ngữ cảnh" title="Bỏ ngữ cảnh" icon={X} className="shrink-0 rounded-full" />
      </span>
    );
  }
  if (campaign) {
    const goal = ctx.channelGoalId ? campaignRepo.goal(ctx.channelGoalId) : undefined;
    const g = goal && goal.campaignId === campaign.id ? goal : undefined;
    return (
      <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-jade/40 py-px pl-3 pr-px text-[12px]" title={filtered ? "Chỉ hiện insight của chiến dịch" : undefined}>
        <Megaphone size={13} className="shrink-0 text-jade" aria-hidden />
        <Link href={`/campaigns/${campaign.id}`} title={campaign.name} className="min-w-0 truncate font-semibold text-ink hover:underline">{campaign.name}</Link>
        <CampaignStatusPill status={campaign.status} />
        {g && <span className="truncate text-ink-2" title={g.objective}>· {channelLabel(g.channel)}</span>}
        <LinkButton href={clear} variant="ghost" size="icon" aria-label="Bỏ ngữ cảnh" title="Bỏ ngữ cảnh" icon={X} className="shrink-0 rounded-full" />
      </span>
    );
  }
  if (campaignRepo.list().filter((c) => c.status !== "ended").length === 0) return null;
  return (
    <details className="group/camp relative">
      <summary className={buttonClass("outline", "md", "list-none [&::-webkit-details-marker]:hidden")}>
        <Megaphone size={16} aria-hidden className="btn-lead" />Chiến dịch<ChevronDown size={14} className="transition-transform group-open/camp:rotate-180" aria-hidden />
      </summary>
      <div className="absolute right-0 z-30 mt-1.5 w-[min(300px,calc(100vw-32px))] rounded-lg border border-border bg-surface p-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.14)] [&_label]:w-full [&_select]:w-full [&_select]:max-w-none">
        <CampaignPicker pathname="/insights/research" params={{ tab: "insight" }} compact />
      </div>
    </details>
  );
}
