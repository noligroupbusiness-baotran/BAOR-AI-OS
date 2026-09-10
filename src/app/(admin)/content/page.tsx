import Link from "next/link";
import { PageHead, Panel, PanelHeader, Rows, Row } from "@/components/ui/card";
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

export const metadata = { title: "Nội dung – BAOR AI OS" };

const input = "h-8 w-full rounded-md border border-border-2 bg-surface px-2.5 text-[13px] text-ink outline-none focus-visible:outline-2 focus-visible:outline-jade";

export default async function ContentPage({ searchParams }: { searchParams: Promise<{ tab?: string; open?: string }> }) {
  const { tab = "proposed", open } = await searchParams;
  const groups: Record<string, string[]> = {
    proposed: ["proposed"],
    mine: ["in_progress", "review"],
    done: ["approved", "scheduled", "published"],
  };
  const statuses = groups[tab] ?? groups.proposed;
  const list = listContent(statuses);
  const insights = listInsights();
  const opened = open ?? (tab === "mine" ? list[0]?.id : undefined);

  return (
    <>
      <PageHead
        title="Nội dung"
        sub="AI đề xuất và viết nháp, bạn là người hoàn thiện. Chỉ bài bạn đã duyệt mới được tự đăng."
        action={
          <div className="flex gap-2">
            <LinkButton href="/content?tab=mine&open=new" size="md">Viết bài mới</LinkButton>
            <form action={aiGenerateIdeas}>
              <Button variant="primary" size="md" type="submit">AI đề xuất 5 ý tưởng</Button>
            </form>
          </div>
        }
      />

      <Segment
        basePath="/content"
        active={tab}
        items={[
          { key: "proposed", label: `AI đề xuất · ${countContent(groups.proposed)}` },
          { key: "mine", label: `Bạn đang làm · ${countContent(groups.mine)}` },
          { key: "done", label: `Đã duyệt · ${countContent(groups.done)}` },
        ]}
      />

      {tab === "mine" && open === "new" && (
        <Panel>
          <PanelHeader title="Bài mới" sub="Bạn tự viết, không qua AI." />
          <form action={createIdea} className="grid gap-3 p-4 md:grid-cols-2">
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
              <LinkButton href="/content?tab=mine" variant="ghost">Hủy</LinkButton>
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
              {tab === "proposed" ? "Chưa có ý tưởng nào. Bấm “AI đề xuất 5 ý tưởng” để bắt đầu." : "Trống."}
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
                    <Link href={`/content?tab=${tab}&open=${c.id}`} className="font-semibold text-ink hover:underline">{c.title}</Link>
                    {c.hook && <div className="mt-px truncate text-[12px] text-ink-2">{c.hook}</div>}
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {tab !== "proposed" && st && <Pill tone={st.tone}>{st.label}</Pill>}
                      <Pill tone="sky">{contentFormatLabel[c.format] ?? c.format}</Pill>
                      {c.pillar && <Pill tone="violet">{c.pillar}</Pill>}
                      {ins && <Pill>{ins.title}</Pill>}
                      {c.source === "ai" && <Pill tone="violet">AI</Pill>}
                      {c.scheduledFor && <Pill className="num">{formatDateTime(c.scheduledFor)}</Pill>}
                    </div>
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
                    {c.status === "in_progress" && !isOpen && <LinkButton href={`/content?tab=mine&open=${c.id}`} variant="soft">Soạn</LinkButton>}
                    {c.status === "approved" && !isOpen && <LinkButton href={`/content?tab=done&open=${c.id}`} variant="primary">Lên lịch</LinkButton>}
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
                          {[["facebook", "Facebook"], ["instagram", "Instagram"], ["tiktok", "TikTok"], ["zalo", "Zalo OA"]].map(([v, l]) => (
                            <label key={v} className="flex items-center gap-1.5">
                              <input type="checkbox" name="platform" value={v} defaultChecked={v === "facebook"} className="accent-[var(--jade)]" /> {l}
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
    </>
  );
}
