import { PageHead, Panel, PanelHeader, Rows, Row } from "@/components/ui/card";
import { Breadcrumb, ModuleGroups } from "@/components/shell/module-page";
import { Pill, Score } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { Table, Th, Td } from "@/components/ui/table";
import { aiGenerateIdeas } from "@/lib/actions/content";
import { listInsights, listPersonas, listResearch } from "@/lib/queries";
import { formatDateTime } from "@/lib/format";
import { CampaignContextBar } from "@/components/campaigns/campaign-context";
import { CampaignTags, LinkToCampaignForm } from "@/components/campaigns/entity-campaign";
import { campaignRepo } from "@/lib/campaigns/repository";
import { readCampaignContext, withCampaignContext } from "@/lib/campaigns/context";

export const metadata = { title: "Nghiên cứu & Insight – BAOR AI OS" };

export default async function ResearchPage({ searchParams }: { searchParams: Promise<{ campaign?: string; goal?: string; link?: string }> }) {
  const sp = await searchParams;
  const ctx = readCampaignContext(sp);
  const campaign = ctx.campaignId ? campaignRepo.get(ctx.campaignId) : undefined;
  const linkedIds = campaign ? new Set(campaignRepo.links(campaign.id, ctx.channelGoalId).filter((l) => l.entityType === "insight").map((l) => l.entityId)) : null;
  const research = listResearch();
  const insights = listInsights().filter((i) => (linkedIds ? linkedIds.has(i.id) : true));
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
          <form action={aiGenerateIdeas}>
            <Button variant="primary" size="md" type="submit">Sinh ý tưởng từ insight</Button>
          </form>
        }
      />

      <CampaignContextBar ctx={ctx} pathname="/insights" params={{}} note={linkedIds ? "chỉ hiện insight của chiến dịch" : undefined} />

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
          {insights.length === 0 && <li className="px-4 py-8 text-center text-[12.5px] text-ink-2">{linkedIds ? "Chiến dịch này chưa gắn insight nào." : "Chưa có insight."}</li>}
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
