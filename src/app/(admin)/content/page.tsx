import Link from "next/link";
import { PageHead, Panel, PanelHeader, Rows } from "@/components/ui/card";
import { Breadcrumb, ModuleGroups } from "@/components/shell/module-page";
import { Pill, Score } from "@/components/ui/pill";
import { Button, LinkButton } from "@/components/ui/button";
import { Segment } from "@/components/ui/segment";
import {
  aiGenerateIdeas,
  aiWriteDraft,
  approveContent,
  claimIdea,
  createIdea,
  dismissIdea,
  saveDraft,
  scheduleContent,
  submitForReview,
} from "@/lib/actions/content";
import { countContent, listContent, listInsights } from "@/lib/queries";
import { contentFormatLabel, contentStatusLabel } from "@/lib/labels";
import { formatDateTime, cn } from "@/lib/format";
import type { ContentStatus } from "@/lib/types";
import { CampaignContextBar } from "@/components/campaigns/campaign-context";
import { CampaignTags, LinkToCampaignForm } from "@/components/campaigns/entity-campaign";
import { campaignRepo } from "@/lib/campaigns/repository";
import { readCampaignContext, withCampaignContext } from "@/lib/campaigns/context";
import { listIntegrationStatus } from "@/lib/connectors/config";

export const metadata = { title: "Nội dung – BAOR AI OS" };

const input = "h-8 w-full rounded-md border border-border-2 bg-surface px-2.5 text-[13px] text-ink outline-none focus-visible:outline-2 focus-visible:outline-jade";

export default async function ContentPage({ searchParams }: { searchParams: Promise<{ tab?: string; open?: string; campaign?: string; goal?: string; link?: string }> }) {
  const sp = await searchParams;
  const { tab = "proposed", open } = sp;
  // Ngữ cảnh chiến dịch (campaign_id, channel_goal_id) do phân hệ Chiến dịch truyền sang.
  const ctx = readCampaignContext(sp);
  const campaign = ctx.campaignId ? campaignRepo.get(ctx.campaignId) : undefined;
  const linkedIds = campaign ? new Set(campaignRepo.links(campaign.id, ctx.channelGoalId).filter((l) => l.entityType === "content").map((l) => l.entityId)) : null;
  const href = (path: string) => withCampaignContext(path, ctx);
  const groups: Record<string, string[]> = {
    proposed: ["proposed"],
    mine: ["in_progress", "review"],
    done: ["approved", "scheduled", "published"],
  };
  const statuses = groups[tab] ?? groups.proposed;
  const list = listContent(statuses).filter((c) => (linkedIds ? linkedIds.has(c.id) : true));
  const insights = listInsights();
  const opened = open ?? (tab === "mine" ? list[0]?.id : undefined);
  const links = campaignRepo.linksForEntities("content", list.map((c) => c.id));
  // Kênh lên lịch đăng: đọc từ Cài đặt › Kết nối, đánh dấu kênh chưa kết nối.
  const connected = new Map(listIntegrationStatus().map((i) => [i.key, i.connected]));
  const publishTargets: [string, string, boolean][] = [
    ["facebook", "Facebook", connected.get("facebook_page") === true],
    ["instagram", "Instagram", connected.get("instagram") === true],
    ["tiktok", "TikTok", connected.get("tiktok") === true],
    ["youtube", "YouTube", connected.get("youtube") === true],
    ["zalo", "Zalo OA", connected.get("zalo_oa") === true],
  ];
  const back = href(`/content?tab=${tab}${opened ? `&open=${opened}` : ""}`);

  return (
    <>
      <Breadcrumb items={[{ label: "Điều hành", href: "/dashboard" }, { label: "Nội dung" }]} />
      <PageHead
        title="Nội dung"
        sub="AI đề xuất và viết nháp, bạn là người hoàn thiện. Chỉ bài bạn đã duyệt mới được tự đăng."
        action={
          <div className="flex gap-2">
            <LinkButton href={href("/content?tab=mine&open=new")} size="md">Viết bài mới</LinkButton>
            <form action={aiGenerateIdeas}>
              <Button variant="primary" size="md" type="submit">AI đề xuất 5 ý tưởng</Button>
            </form>
          </div>
        }
      />

      <CampaignContextBar ctx={ctx} pathname="/content" params={{ tab, open }} note={linkedIds ? "chỉ hiện nội dung đã gắn vào chiến dịch" : undefined} />

      <div className="mt-3.5">
        <Segment
          basePath={href("/content")}
          active={tab}
          items={[
            { key: "proposed", label: `AI đề xuất · ${countContent(groups.proposed)}` },
            { key: "mine", label: `Bạn đang làm · ${countContent(groups.mine)}` },
            { key: "done", label: `Đã duyệt · ${countContent(groups.done)}` },
          ]}
        />
      </div>

      {tab === "mine" && open === "new" && (
        <Panel>
          <PanelHeader title="Bài mới" sub={campaign ? `Bạn tự viết. Bài sẽ tự gắn vào chiến dịch “${campaign.name}”.` : "Bạn tự viết, không qua AI."} />
          <form action={createIdea} className="grid gap-3 p-4 md:grid-cols-2">
            {campaign && <input type="hidden" name="campaignId" value={campaign.id} />}
            {campaign && ctx.channelGoalId && <input type="hidden" name="channelGoalId" value={ctx.channelGoalId} />}
            <label className="block md:col-span-2">
              <span className="lbl">Tiêu đề</span>
              <input name="title" required className={cn(input, "mt-1")} placeholder="VD: Khách thật test serum 7 ngày" />
            </label>
            <label className="block">
              <span className="lbl">Định dạng</span>
              <select name="format" className={cn(input, "mt-1")}>
                {Object.entries(contentFormatLabel).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="lbl">Trụ cột</span>
              <input name="pillar" className={cn(input, "mt-1")} placeholder="Niềm tin / Giáo dục / Bằng chứng…" />
            </label>
            <label className="block md:col-span-2">
              <span className="lbl">Hook</span>
              <input name="hook" className={cn(input, "mt-1")} placeholder="Câu mở đầu giữ chân người xem" />
            </label>
            <div className="flex gap-2 md:col-span-2">
              <Button variant="primary" type="submit">Tạo bài</Button>
              <LinkButton href={href("/content?tab=mine")} variant="ghost">Hủy</LinkButton>
            </div>
          </form>
        </Panel>
      )}

      <Panel>
        <PanelHeader
          title={tab === "proposed" ? "Đáng làm nhất hôm nay" : tab === "mine" ? "Bàn làm việc của bạn" : "Đã duyệt và đã đăng"}
          sub={tab === "proposed" ? "Xếp theo tín hiệu thật từ khách." : tab === "mine" ? "Bấm vào bài để soạn." : "Bài đã duyệt chờ xếp lịch, bài đã lên lịch sẽ tự đăng."}
        />
        <Rows>
          {list.length === 0 && (
            <li className="px-4 py-8 text-center text-[12.5px] text-ink-2">
              {linkedIds ? "Chiến dịch này chưa có nội dung ở mục này. Bấm “Viết bài mới” để tạo bài gắn sẵn vào chiến dịch." : tab === "proposed" ? "Chưa có ý tưởng nào. Bấm “AI đề xuất 5 ý tưởng” để bắt đầu." : "Trống."}
            </li>
          )}
          {list.map((c, idx) => {
            const ins = insights.find((i) => i.id === c.insightId);
            const st = contentStatusLabel[c.status as ContentStatus];
            const isOpen = opened === c.id;
            return (
              <li key={c.id} className={cn("border-b border-border last:border-b-0", isOpen && "bg-jade-soft/30")}>
                <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-2.5">
                  <span className="flex items-center gap-3">
                    <span className="w-3 text-[12px] font-semibold text-ink-3">{idx + 1}</span>
                    <Score value={c.score ?? 0} />
                  </span>
                  <div className="min-w-0">
                    <Link href={href(`/content?tab=${tab}&open=${c.id}`)} className="font-semibold text-ink hover:underline">{c.title}</Link>
                    {c.hook && <div className="mt-px truncate text-[12px] text-ink-2">{c.hook}</div>}
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {tab !== "proposed" && st && <Pill tone={st.tone}>{st.label}</Pill>}
                      <Pill tone="sky">{contentFormatLabel[c.format] ?? c.format}</Pill>
                      {c.pillar && <Pill tone="violet">{c.pillar}</Pill>}
                      {ins && <Pill>{ins.title}</Pill>}
                      {c.source === "ai" && <Pill tone="violet">AI</Pill>}
                      {c.scheduledFor && <Pill className="num">{formatDateTime(c.scheduledFor)}</Pill>}
                      <CampaignTags links={links.get(c.id)} />
                    </div>
                    {isOpen && (
                      <div className="mt-1.5">
                        <LinkToCampaignForm entityType="content" entityId={c.id} status={c.status} back={back} links={links.get(c.id)} compact open={sp.link === c.id} />
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1.5">
                    {c.status === "proposed" && (
                      <>
                        <form action={claimIdea}><input type="hidden" name="id" value={c.id} /><Button variant="soft" type="submit">Nhận làm</Button></form>
                        <form action={dismissIdea}><input type="hidden" name="id" value={c.id} /><Button variant="ghost" type="submit">Bỏ qua</Button></form>
                      </>
                    )}
                    {c.status === "review" && (
                      <form action={approveContent}><input type="hidden" name="id" value={c.id} /><Button variant="primary" type="submit">Duyệt</Button></form>
                    )}
                    {c.status === "in_progress" && !isOpen && <LinkButton href={href(`/content?tab=mine&open=${c.id}`)} variant="soft">Soạn</LinkButton>}
                    {c.status === "approved" && !isOpen && <LinkButton href={href(`/content?tab=done&open=${c.id}`)} variant="primary">Lên lịch</LinkButton>}
                  </div>
                </div>

                {isOpen && c.status === "proposed" && (
                  <div className="border-t border-border px-4 py-3 text-[12.5px]">
                    <div className="lbl">Dàn ý AI đề xuất</div>
                    <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-ink">{c.outline.map((o) => <li key={o}>{o}</li>)}</ol>
                  </div>
                )}

                {isOpen && (c.status === "in_progress" || c.status === "review") && (
                  <div className="border-t border-border px-4 py-3">
                    <form action={saveDraft} className="grid gap-3">
                      <input type="hidden" name="id" value={c.id} />
                      <label className="block">
                        <span className="lbl">Hook</span>
                        <input name="hook" defaultValue={c.hook} className={cn(input, "mt-1")} />
                      </label>
                      <label className="block">
                        <span className="lbl">Bản nháp</span>
                        <textarea
                          name="draft"
                          rows={10}
                          defaultValue={c.draft ?? ""}
                          placeholder="Viết bản nháp ở đây, hoặc bấm “AI viết nháp”."
                          className="mt-1 w-full rounded-md border border-border-2 bg-surface px-3 py-2 text-[13px] leading-relaxed text-ink outline-none focus-visible:outline-2 focus-visible:outline-jade"
                        />
                      </label>
                      {c.outline.length > 0 && (
                        <div className="text-[12px] text-ink-2">Dàn ý: {c.outline.map((o, k) => `${k + 1}. ${o}`).join(" · ")}</div>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <Button type="submit">Lưu nháp</Button>
                        <Button type="submit" variant="primary" formAction={submitForReview}>Gửi duyệt</Button>
                        <Button type="submit" variant="soft" formAction={aiWriteDraft}>AI viết nháp</Button>
                      </div>
                    </form>
                  </div>
                )}

                {isOpen && c.status === "approved" && (
                  <div className="border-t border-border px-4 py-3">
                    <form action={scheduleContent} className="grid gap-3 md:grid-cols-[auto_1fr_auto] md:items-end">
                      <input type="hidden" name="id" value={c.id} />
                      <label className="block">
                        <span className="lbl">Giờ đăng (giờ VN)</span>
                        <input type="datetime-local" name="when" required className={cn(input, "mt-1")} />
                      </label>
                      <div>
                        <span className="lbl">Kênh</span>
                        <div className="mt-1 flex flex-wrap gap-3 text-[13px]">
                          {publishTargets.map(([v, l, on]) => (
                            <label key={v} className="flex items-center gap-1.5" title={on ? undefined : "Chưa kết nối trong Cài đặt: bài sẽ chờ tới khi kết nối"}>
                              <input type="checkbox" name="platform" value={v} defaultChecked={v === "facebook"} className="accent-[var(--jade)]" /> {l}
                              {!on && <span className="text-[11px] text-amber">chưa kết nối</span>}
                            </label>
                          ))}
                        </div>
                      </div>
                      <Button variant="primary" type="submit">Lên lịch</Button>
                    </form>
                  </div>
                )}

                {isOpen && (c.status === "scheduled" || c.status === "published") && c.draft && (
                  <div className="whitespace-pre-line border-t border-border px-4 py-3 text-[12.5px] leading-relaxed text-ink">{c.draft}</div>
                )}
              </li>
            );
          })}
        </Rows>
      </Panel>

      {tab === "proposed" && (
        <p className="mt-3.5 rounded-[var(--radius)] bg-violet-soft px-3.5 py-2.5 text-[12.5px] text-ink">
          <b className="text-violet">AI đề xuất</b> chỉ là gợi ý. Nhận làm để tự viết, hoặc để AI viết nháp rồi bạn sửa và duyệt.
        </p>
      )}
      <ModuleGroups moduleKey="content" />
    </>
  );
}
