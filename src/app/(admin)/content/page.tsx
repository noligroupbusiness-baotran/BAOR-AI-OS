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
  insertTemplate,
  attachContentImage,
  removeContentImage,
} from "@/lib/actions/content";
import { IMAGE_SPECS, kindLabel, kindOf, type ContentKind } from "@/lib/content/formats";
import { CaptionHelper, ScriptHelper } from "@/components/content/format-helpers";
import { fileUrl, getUpload } from "@/lib/uploads";
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

export default async function ContentPage({ searchParams }: { searchParams: Promise<{ tab?: string; open?: string; campaign?: string; goal?: string; link?: string; kind?: string }> }) {
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
  const kinds: ContentKind[] = ["text", "script", "caption", "image"];
  const kind = kinds.includes(sp.kind as ContentKind) ? (sp.kind as ContentKind) : null;
  const all = listContent(statuses).filter((c) => (linkedIds ? linkedIds.has(c.id) : true));
  const list = kind ? all.filter((c) => kindOf(c.format) === kind) : all;
  const kindCount = (k: ContentKind) => all.filter((c) => kindOf(c.format) === k).length;
  const kindHref = (k: ContentKind | null) => href(`/content?tab=${tab}${k ? `&kind=${k}` : ""}`);
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

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[12px]">
        <span className="text-ink-3">Loại:</span>
        <Link href={kindHref(null)} className={cn("rounded-full border px-2.5 py-0.5", !kind ? "border-jade/40 bg-jade-soft font-semibold text-jade-ink" : "border-border-2 text-ink-2 hover:bg-ground-2")}>Tất cả · {all.length}</Link>
        {kinds.map((k) => (
          <Link key={k} href={kindHref(k)} className={cn("rounded-full border px-2.5 py-0.5", kind === k ? "border-jade/40 bg-jade-soft font-semibold text-jade-ink" : "border-border-2 text-ink-2 hover:bg-ground-2")}>{kindLabel[k]} · {kindCount(k)}</Link>
        ))}
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
              <select name="format" defaultValue={kind === "script" ? "script" : kind === "caption" ? "caption" : kind === "image" ? "image" : "post"} className={cn(input, "mt-1")}>
                {Object.entries(contentFormatLabel).map(([k, v]) => (
                  <option key={k} value={k}>{v}{kindOf(k) !== "text" ? ` (${kindLabel[kindOf(k)]})` : ""}</option>
                ))}
              </select>
              <span className="mt-1 block text-[11px] text-ink-3">Kịch bản video và Hình ảnh được điền sẵn khung mẫu.</span>
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
                    {c.status === "approved" && kindOf(c.format) === "script" && <LinkButton href={href(`/video-studio?upload=1&content=${c.id}`)} variant="soft">Tạo video</LinkButton>}
                    {c.status === "approved" && !isOpen && kindOf(c.format) !== "script" && <LinkButton href={href(`/content?tab=done&open=${c.id}`)} variant="primary">Lên lịch</LinkButton>}
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
                    <form id={`draft-${c.id}`} action={saveDraft} className="grid gap-3">
                      <input type="hidden" name="id" value={c.id} />
                      <label className="block">
                        <span className="lbl">{kindOf(c.format) === "image" ? "Thông điệp trên ảnh" : "Hook"}</span>
                        <input name="hook" defaultValue={c.hook} className={cn(input, "mt-1")} />
                      </label>
                      <label className="block">
                        <span className="lbl">{kindOf(c.format) === "script" ? "Kịch bản" : kindOf(c.format) === "caption" ? "Caption" : kindOf(c.format) === "image" ? "Mô tả ảnh (brief)" : "Bản nháp"}</span>
                        <textarea
                          name="draft"
                          rows={kindOf(c.format) === "caption" ? 6 : 10}
                          defaultValue={c.draft ?? ""}
                          placeholder="Viết bản nháp ở đây, hoặc bấm “AI viết nháp”."
                          className="mt-1 w-full rounded-md border border-border-2 bg-surface px-3 py-2 text-[13px] leading-relaxed text-ink outline-none focus-visible:outline-2 focus-visible:outline-jade"
                        />
                      </label>
                      {kindOf(c.format) === "caption" && <CaptionHelper formId={`draft-${c.id}`} />}
                      {kindOf(c.format) === "script" && <ScriptHelper formId={`draft-${c.id}`} />}
                      {kindOf(c.format) === "image" && (
                        <div className="rounded-md border border-border bg-ground px-3 py-2 text-[12px] text-ink-2">
                          <div className="font-semibold text-ink">Kích thước cần xuất</div>
                          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5">{IMAGE_SPECS.map((sp2) => <span key={sp2.platform} title={sp2.note}>{sp2.label}: <span className="num text-ink">{sp2.ratio}</span> ({sp2.size})</span>)}</div>
                          <div className="mt-1 text-[11px] text-ink-3">Chữ trên ảnh không quá 20% diện tích; màu và font lấy từ Cài đặt › Thương hiệu.</div>
                        </div>
                      )}
                      {c.outline.length > 0 && (
                        <div className="text-[12px] text-ink-2">Dàn ý: {c.outline.map((o, k) => `${k + 1}. ${o}`).join(" · ")}</div>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <Button type="submit">Lưu nháp</Button>
                        <Button type="submit" variant="primary" formAction={submitForReview}>Gửi duyệt</Button>
                        <Button type="submit" variant="soft" formAction={aiWriteDraft}>AI viết nháp</Button>
                        {(kindOf(c.format) === "script" || kindOf(c.format) === "image") && <Button type="submit" variant="ghost" formAction={insertTemplate}>Chèn khung mẫu</Button>}
                      </div>
                    </form>
                    {(() => {
                      const asset = c.assetUploadId ? getUpload(c.assetUploadId) : undefined;
                      return (
                        <div className="mt-3 grid gap-2 border-t border-border pt-3 md:grid-cols-[auto_1fr] md:items-center">
                          {asset ? (
                            <div className="flex items-center gap-3">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={fileUrl(asset.id)} alt={asset.name} className="h-20 w-20 rounded-md border border-border object-cover" />
                              <div className="text-[12px] text-ink-2">
                                <div className="font-medium text-ink">{asset.name}</div>
                                <div className="num">{Math.round(asset.size / 1024)} KB</div>
                                <form action={removeContentImage}><input type="hidden" name="id" value={c.id} /><button type="submit" className="mt-1 cursor-pointer text-[12px] text-brick hover:underline">Gỡ ảnh</button></form>
                              </div>
                            </div>
                          ) : (
                            <div className="text-[12px] text-ink-3">{kindOf(c.format) === "image" ? "Chưa có ảnh. Tải ảnh đã thiết kế lên để duyệt." : "Ảnh minh họa (tùy chọn)."}</div>
                          )}
                          <form action={attachContentImage} className="flex flex-wrap items-center gap-2">
                            <input type="hidden" name="id" value={c.id} />
                            <input type="file" name="file" required accept="image/png,image/jpeg,image/webp" className="block text-[12px] text-ink-2 file:mr-2 file:rounded-full file:border file:border-border-2 file:bg-surface file:px-2.5 file:py-1 file:text-[12px] file:text-ink" />
                            <Button type="submit">{asset ? "Thay ảnh" : "Đính kèm ảnh"}</Button>
                            <span className="text-[11px] text-ink-3">PNG, JPG, WebP, tối đa 8 MB</span>
                          </form>
                        </div>
                      );
                    })()}
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

                {isOpen && (c.status === "scheduled" || c.status === "published" || c.status === "approved") && c.draft && (
                  <div className="border-t border-border px-4 py-3 text-[12.5px] leading-relaxed text-ink">
                    {c.assetUploadId && getUpload(c.assetUploadId) && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={fileUrl(c.assetUploadId)} alt="" className="mb-2 max-h-56 rounded-md border border-border object-contain" />
                    )}
                    <div className="whitespace-pre-line">{c.draft}</div>
                  </div>
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
