import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHead, Panel, PanelHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { inputClass, textareaClass } from "@/components/ui/field";
import { SubmitButton } from "@/components/campaigns/submit-button";
import { addSourceAction, deleteInsightAction, toggleResearchAiAction, webResearchAction } from "@/lib/actions/research";
import { getResearchTask } from "@/lib/research";
import { SOCIAL_KINDS } from "@/lib/research/social";
import { topicInsights } from "@/lib/research/topic";
import { roleById, roleSettings } from "@/lib/ai-roster";
import { aiReadiness, webSearchProvider } from "@/lib/ai";
import { AiBlocked } from "@/components/ui/ai-blocked";
import { SwitchSubmit } from "@/components/ui/switch";
import { currentActor, can } from "@/lib/permissions";

export const metadata = { title: "Chủ đề nghiên cứu – BAOR AI OS" };

// Trang chủ đề (bước 2): thêm bình luận từ nền tảng → insight; AI Nghiên cứu khi được phép; → Tạo 10 hook (bước 3).
export default async function TopicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = getResearchTask(id);
  if (!r) notFound();
  const actor = await currentActor();
  const topic = r.task.question.replace(/^Chủ đề: /, "");
  const insights = topicInsights(id);
  const role = roleById("research")!;
  const enabled = roleSettings(role).enabled;
  // Trạng thái thật của nút AI: công tắc + khoá hãng của mô hình vị trí (+ hãng của bước tìm web: ChatGPT / Claude, Grok → Claude) + trần
  const ready = aiReadiness("research");
  const webReady = aiReadiness("research", { alsoProvider: webSearchProvider("research") });
  const aiReady = ready.ok;
  const back = `/insights/research/${id}`;
  const groups = new Map<string, typeof insights>();
  for (const i of insights) groups.set(i.source, [...(groups.get(i.source) ?? []), i]);

  return (
    <>
      <PageHead
        title={topic}
        sub={`${insights.length} insight`}
        action={<LinkButton href={`/content/hooks?research=${id}&topic=${encodeURIComponent(topic)}`} variant="primary" size="md">Tạo 10 hook từ insight</LinkButton>}
      />

      <Panel>
        <PanelHeader
          title="Thêm từ nền tảng"
          sub="Dán bình luận, mỗi dòng một bình luận."
          action={
            can(actor, "admin") ? (
              <form action={toggleResearchAiAction} className="flex shrink-0 items-center gap-2 text-[12.5px]">
                {/* Công tắc: gạt là đổi sang trạng thái kia (trước đây nút ghi trạng thái hiện tại nhưng bấm lại tắt) */}
                <input type="hidden" name="on" value={enabled ? "0" : "1"} />
                <input type="hidden" name="back" value={back} />
                <span className="whitespace-nowrap text-ink-2">AI Nghiên cứu</span>
                <SwitchSubmit on={enabled} label={enabled ? "AI Nghiên cứu đang bật — gạt để tắt" : "AI Nghiên cứu đang tắt — gạt để bật"} />
              </form>
            ) : undefined
          }
        />
        <form action={addSourceAction} className="grid gap-2 p-4">
          <input type="hidden" name="id" value={id} />
          <div className="grid gap-2 md:grid-cols-[220px_1fr]">
            <select name="kind" defaultValue="fb_group" className={inputClass} aria-label="Nguồn">
              {Object.entries(SOCIAL_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input name="url" required placeholder="Link bài / video / nhóm (https://…)" className={inputClass} />
          </div>
          <textarea name="paste" rows={6} required className={textareaClass} placeholder="Dán bình luận vào đây…" />
          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton pendingText={aiReady ? "Đang phân tích (có AI)…" : "Đang phân tích…"}>Phân tích</SubmitButton>
            {aiReady ? (
              <label className="flex items-center gap-1.5 text-[12.5px] text-ink"><input type="checkbox" name="ai" defaultChecked /> AI phân tích thêm (tính phí)</label>
            ) : (
              <span className="flex items-center gap-2 text-[12px] text-ink-3">Theo luật <AiBlocked ready={ready} /></span>
            )}
          </div>
        </form>
        <div className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-3">
          <form action={webResearchAction}>
            <input type="hidden" name="id" value={id} />
            <SubmitButton variant="soft" pendingText="AI đang tìm…" disabled={!webReady.ok} title={webReady.ok ? "AI tìm kiến thức trên web, dẫn nguồn" : webReady.reason}>AI tìm kiến thức trên mạng</SubmitButton>
          </form>
          <AiBlocked ready={webReady} />
        </div>
      </Panel>

      <Panel>
        <PanelHeader title="Insight" />
        {insights.length === 0 ? (
          <EmptyState title="Chưa có insight" hint="Dán bình luận ở trên rồi bấm Phân tích." />
        ) : (
          [...groups.entries()].map(([source, list]) => (
            <div key={source} className="border-b border-border last:border-b-0">
              <h3 className="px-4 pt-3 text-[11.5px] font-semibold uppercase tracking-wide text-ink-3">{source}</h3>
              <ul className="m-0 list-none p-0">
                {list.map((i) => (
                  <li key={i.id} className="flex items-start gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] leading-relaxed text-ink">{i.statement}</p>
                      {i.application && <p className="mt-0.5 text-[12.5px] text-ink-2">→ {i.application}</p>}
                      <div className="mt-1 flex gap-1.5">
                        <Pill tone={i.byAi ? "violet" : "neutral"}>{i.byAi ? "AI" : "Theo luật"}</Pill>
                        {!i.ok && <Pill tone="amber">chưa đủ căn cứ</Pill>}
                      </div>
                    </div>
                    {can(actor, "manager") && (
                      <form action={deleteInsightAction}>
                        <input type="hidden" name="id" value={id} />
                        <input type="hidden" name="finding" value={i.id} />
                        <SubmitButton variant="ghost">Bỏ</SubmitButton>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </Panel>
      <p className="mt-3 text-[12px] text-ink-3"><Link href="/insights/research" className="hover:underline">← Tất cả chủ đề</Link></p>
    </>
  );
}
