import { PageHead, Panel, PanelHeader, Rows, Row } from "@/components/ui/card";
import { Breadcrumb, ModuleGroups } from "@/components/shell/module-page";
import { Pill, Score } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { Table, Th, Td } from "@/components/ui/table";
import { aiGenerateIdeas } from "@/lib/actions/content";
import { aiExtractInsights, createInsight, decideInsight } from "@/lib/actions/insights";
import { Field, inputClass, textareaClass } from "@/components/ui/field";
import { LinkButton } from "@/components/ui/button";
import { SubmitButton } from "@/components/campaigns/submit-button";
import { EmptyState } from "@/components/ui/empty-state";
import { listInsights, listPersonas, listResearch } from "@/lib/queries";
import { formatDateTime } from "@/lib/format";
import { CampaignContextBar } from "@/components/campaigns/campaign-context";
import { CampaignTags, LinkToCampaignForm } from "@/components/campaigns/entity-campaign";
import { campaignRepo } from "@/lib/campaigns/repository";
import { readCampaignContext, withCampaignContext } from "@/lib/campaigns/context";
import { CompetitorsPanel } from "@/components/insights/competitors-panel";

export const metadata = { title: "Nghiên cứu & Insight – BAOR AI OS" };

export default async function ResearchPage({ searchParams }: { searchParams: Promise<{ campaign?: string; goal?: string; link?: string; add?: string; competitor?: string }> }) {
  const sp = await searchParams;
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
  const back = withCampaignContext("/insights#insights", ctx);

  return (
    <>
      <Breadcrumb items={[{ label: "Điều hành", href: "/dashboard" }, { label: "Nghiên cứu & Insight" }]} />
      <PageHead
        title="Nghiên cứu & Insight"
        sub="AI đọc bình luận, inbox và số liệu kênh, gom thành insight để đề xuất nội dung. Kết nối Facebook để AI tự cập nhật."
        action={
          <div className="flex flex-wrap gap-2">
            <LinkButton href="/insights?add=1#add" size="md">Thêm insight</LinkButton>
            <form action={aiExtractInsights}>
              <Button size="md" type="submit" variant="soft">AI rút insight từ dữ liệu</Button>
            </form>
            <form action={aiGenerateIdeas}>
              <Button variant="primary" size="md" type="submit">Sinh ý tưởng từ insight</Button>
            </form>
          </div>
        }
      />

      <CampaignContextBar ctx={ctx} pathname="/insights" params={{}} note={linkedIds ? "chỉ hiện insight của chiến dịch" : undefined} />

      {sp.add === "1" && (
        <Panel id="add">
          <PanelHeader title="Thêm insight" sub="Từ khảo sát, quan sát tại quầy, phản hồi trực tiếp. Ghi rõ nguồn để người khác kiểm chứng." />
          <form action={createInsight} className="grid gap-3 p-4 md:grid-cols-2">
            <Field label="Insight" required className="md:col-span-2"><input name="title" required className={inputClass} placeholder="VD: Khách văn phòng muốn dịch vụ dưới 45 phút" /></Field>
            <Field label="Chi tiết" className="md:col-span-2"><textarea name="detail" rows={2} className={textareaClass} /></Field>
            <Field label="Nguồn phát hiện" required><input name="source" required className={inputClass} placeholder="VD: Khảo sát 120 khách tại quầy" /></Field>
            <Field label="Độ tin cậy (%)"><input name="confidence" inputMode="numeric" defaultValue={70} className={inputClass} /></Field>
            <Field label="Bằng chứng / trích dẫn" className="md:col-span-2"><input name="evidence" className={inputClass} placeholder="VD: 71% chọn dịch vụ dưới 45 phút" /></Field>
            <Field label="Nhóm khách hàng">
              <select name="personaId" defaultValue="" className={inputClass}><option value="">Chưa gắn</option>{personas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            </Field>
            <div className="flex gap-2 md:col-span-2"><SubmitButton pendingText="Đang lưu…">Thêm insight</SubmitButton><LinkButton href="/insights" variant="ghost">Hủy</LinkButton></div>
          </form>
        </Panel>
      )}

      <Panel id="proposed">
        <PanelHeader title="Insight AI đề xuất, chờ duyệt" sub={proposed.length ? `${proposed.length} insight kèm bằng chứng. Duyệt thì mới được dùng để sinh nội dung.` : `Chưa có đề xuất chờ duyệt${rejected ? ` · ${rejected} đã từ chối` : ""}. Bấm “AI rút insight từ dữ liệu” khi đã có inbox, lead, bài đăng.`} />
        {proposed.length > 0 && (
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
        )}
      </Panel>

      <Panel id="channels">
        <PanelHeader title="Kênh phù hợp" sub={`Cập nhật ${research[0] ? formatDateTime(research[0].updatedAt) : "—"} · chấm theo mức khớp với khách hàng mục tiêu.`} />
        <Table>
          <thead>
            <tr>
              <Th>Kênh</Th>
              <Th>Đang lên</Th>
              <Th>Giờ vàng</Th>
              <Th right>Phù hợp</Th>
            </tr>
          </thead>
          <tbody>
            {research.map((r) => (
              <tr key={r.id}>
                <Td className="font-semibold text-ink">{r.name}</Td>
                <Td>{r.trendingTopics.slice(0, 3).join(" · ")}</Td>
                <Td className="num">{r.bestPostingTimes.join(" · ")}</Td>
                <Td right>
                  <Pill tone={r.audienceFit >= 80 ? "jade" : r.audienceFit >= 70 ? "amber" : "neutral"} className="num">{r.audienceFit}%</Pill>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Panel>

      <CompetitorsPanel editing={sp.competitor} />

      <Panel id="personas">
        <PanelHeader title="Chân dung khách hàng" sub="Tỷ lệ trong tập khách và nỗi đau chính." />
        <Rows>
          {personas.map((p) => (
            <Row
              key={p.id}
              lead={<Pill tone="jade" className="num">{p.share}%</Pill>}
              title={p.name}
              sub={`${p.ageRange} tuổi · ${p.occupation} · ${p.location}`}
              extra={<div className="mt-1 text-[12px] text-ink-2">Nỗi đau: {p.painPoints.join(" · ")}</div>}
            />
          ))}
        </Rows>
      </Panel>

      <Panel id="insights">
        <PanelHeader title="Insight đang dùng" sub="Xếp theo độ tin cậy. Mỗi insight gắn với chiến dịch, mục tiêu kênh, nhóm khách và nguồn phát hiện." />
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
      <ModuleGroups moduleKey="insights" />
    </>
  );
}
