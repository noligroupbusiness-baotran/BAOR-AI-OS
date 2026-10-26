import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, Sparkles } from "lucide-react";
import { PageHead, Panel, PanelHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { EmptyState } from "@/components/ui/empty-state";
import { textareaClass } from "@/components/ui/field";
import { SubmitButton } from "@/components/campaigns/submit-button";
import { LinkButton } from "@/components/ui/button";
import { SourceLinkFields } from "@/components/research/source-link-fields";
import { analyzeSourceAction, approveInsightAction, deleteInsightAction, painResearchAction, toggleAutoResearchAction } from "@/lib/actions/research";
import { getResearchTask } from "@/lib/research";
import { lastLink, topicInsights } from "@/lib/research/topic";
import { autoResearchEnabled, lastAutoAt } from "@/lib/research/auto";
import { youtubeReadiness } from "@/lib/research/youtube";
import { aiReadiness, webSearchProvider } from "@/lib/ai";
import { AiBlocked } from "@/components/ui/ai-blocked";
import { SwitchSubmit } from "@/components/ui/switch";
import { currentActor, can } from "@/lib/permissions";
import { formatDateTime, cn } from "@/lib/format";
import { insightScores, topicCounts, topicHooks } from "@/lib/content/priority";
import { topPicks } from "@/lib/content/scoring";
import { nextStep } from "@/lib/content/flow";
import { HOOK_COUNT } from "@/lib/content/hooks";
import { aiGenerateHooks, pickHookAction, rejectHookAction } from "@/lib/actions/hooks";
import { FlowSteps, NextStep } from "@/components/research/topic-flow";
import { ScoreTip, TopPick } from "@/components/ui/score-tip";

export const metadata = { title: "Chủ đề nghiên cứu – BAOR AI OS" };

// Trang chủ đề (bước 2), bản tối giản (OWNER 26/10): MỘT hàng nền tảng + link + "Phân tích" (hệ thống tự đọc bình luận), MỘT nút
// "AI tìm nỗi đau khách" (YouTube + web Việt Nam), ô dán bình luận chỉ mở khi link không đọc tự động được. → Tạo 10 hook (bước 3).
// OWNER 26/10 ("mục 1 và 2 chưa liên kết chặt chẽ… không có đánh giá ưu tiên"): một luồng trên MỘT trang — Insight (chấm điểm, xếp
// theo điểm) → Hook của chủ đề ngay bên dưới (chấm điểm, "Viết kịch bản" một chạm) → kịch bản vlog < 1 phút.
export default async function TopicPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ paste?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const r = getResearchTask(id);
  if (!r) notFound();
  const actor = await currentActor();
  const topic = r.task.question.replace(/^Chủ đề: /, "");
  const insights = topicInsights(id);
  const pendingCount = insights.filter((i) => i.pending).length;
  // Từng nguồn của "AI tìm nỗi đau khách": nguồn nào thiếu khoá thì bỏ qua, chỉ hiện nhãn ngắn
  const yt = youtubeReadiness();
  const web = aiReadiness("research", { alsoProvider: webSearchProvider("research") });
  const anyReady = yt.ok || web.ok;
  const auto = autoResearchEnabled();
  const autoAt = lastAutoAt(id);
  const link = lastLink(id);
  const openPaste = sp.paste === "1";
  const back = `/insights/research/${id}`;
  const scores = insightScores([id]);
  const ranked = insights.map((i) => ({ ...i, score: scores.get(i.id)?.score ?? 0, reasons: scores.get(i.id)?.reasons ?? [] })).sort((a, b) => b.score - a.score);
  const topIns = topPicks(ranked.filter((i) => i.ok && !i.pending));
  const hooks = topicHooks(id);
  const counts = topicCounts(id, scores, hooks);
  const step = nextStep(counts);
  const hookAi = aiReadiness("ideas");
  const SHOW = 5;

  return (
    <>
      <PageHead
        title={topic}
        sub={`${insights.length} insight${pendingCount ? ` · ${pendingCount} chờ duyệt` : ""}`}
        action={<NextStep id={id} topic={topic} step={step} aiReady={hookAi.ok} aiReason={hookAi.ok ? undefined : hookAi.reason} onDetail />}
      />
      <FlowSteps counts={counts} className="appear appear--soft -mt-2 mb-3 [--d:1]" />

      <Panel>
        <div id="insight-add" className="scroll-mt-20" />
        <PanelHeader
          title="Thêm từ nền tảng"
          action={
            can(actor, "admin") ? (
              <form action={toggleAutoResearchAction} className="flex shrink-0 items-center gap-2 text-[12.5px]">
                <input type="hidden" name="on" value={auto ? "0" : "1"} />
                <input type="hidden" name="back" value={back} />
                <span className="whitespace-nowrap text-ink-2" title={autoAt ? `Lần tự nghiên cứu gần nhất: ${formatDateTime(autoAt)}` : "Chưa tự nghiên cứu chủ đề này"}>
                  Tự nghiên cứu{autoAt ? <span className="text-ink-3"> · {formatDateTime(autoAt)}</span> : null}
                </span>
                <SwitchSubmit on={auto} label={auto ? "Tự nghiên cứu đang bật — gạt để tắt" : "Tự nghiên cứu đang tắt — gạt để bật"} />
              </form>
            ) : undefined
          }
        />
        <form action={analyzeSourceAction} className="grid gap-2 p-4">
          <input type="hidden" name="id" value={id} />
          <div className="grid gap-2 md:grid-cols-[160px_1fr_auto] md:items-center">
            <SourceLinkFields key={link?.url ?? ""} defaultUrl={openPaste ? (link?.url ?? "") : ""} defaultKind={openPaste ? link?.kind : undefined} />
            <SubmitButton pendingText="Đang đọc…">Phân tích</SubmitButton>
          </div>
          <details open={openPaste} className="group/paste">
            <summary className="cursor-pointer list-none text-[12px] text-ink-3 hover:text-ink-2 [&::-webkit-details-marker]:hidden">Dán bình luận</summary>
            <textarea name="paste" rows={6} className={`${textareaClass} mt-2`} placeholder="Bôi đen khung bình luận, chép rồi dán vào đây…" />
          </details>
        </form>
        <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
          <form action={painResearchAction}>
            <input type="hidden" name="id" value={id} />
            <SubmitButton variant="soft" pendingText="AI đang tìm…" disabled={!anyReady} title={anyReady ? "YouTube + web Việt Nam, dẫn nguồn" : "Chưa có khoá YouTube / AI tìm web"}>
              <Sparkles size={13} aria-hidden />
              AI tìm nỗi đau khách
            </SubmitButton>
          </form>
          <AiBlocked ready={yt} />
          <AiBlocked ready={web} />
        </div>
      </Panel>

      <Panel>
        <div id="insights" className="scroll-mt-20" />
        <PanelHeader title="Insight" sub={ranked.length ? "Xếp theo điểm ưu tiên" : undefined} />
        {ranked.length === 0 ? (
          <EmptyState title="Chưa có insight" hint="Dán link bài / video rồi bấm Phân tích." />
        ) : (
          <ul className="m-0 list-none p-0">
            {ranked.map((i) => (
              <li key={i.id} className="flex items-start gap-3 border-b border-border px-4 py-2.5 last:border-b-0">
                <ScoreTip score={i.score} reasons={i.reasons} kind="insight" className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] leading-relaxed text-ink">{i.statement}</p>
                  {i.application && <p className="mt-0.5 text-[12.5px] text-ink-2">→ {i.application}</p>}
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {topIns.has(i.id) && <TopPick />}
                    <Pill tone="neutral">{i.platform}</Pill>
                    <Pill tone={i.byAi ? "violet" : "neutral"}>{i.byAi ? "AI" : "Theo luật"}</Pill>
                    {i.pending && <Pill tone="amber">Chờ duyệt</Pill>}
                    {!i.ok && <Pill tone="amber">chưa đủ căn cứ</Pill>}
                    {i.url && (
                      <a href={i.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-[11.5px] text-ink-3 hover:text-ink-2 hover:underline" aria-label={`Mở nguồn ${i.platform}`}>
                        <ExternalLink size={11} aria-hidden />Nguồn
                      </a>
                    )}
                  </div>
                </div>
                {can(actor, "manager") && (
                  <div className="flex shrink-0 items-center gap-1">
                    {i.pending && (
                      <form action={approveInsightAction}>
                        <input type="hidden" name="id" value={id} />
                        <input type="hidden" name="finding" value={i.id} />
                        <SubmitButton>Duyệt</SubmitButton>
                      </form>
                    )}
                    <form action={deleteInsightAction}>
                      <input type="hidden" name="id" value={id} />
                      <input type="hidden" name="finding" value={i.id} />
                      <SubmitButton variant="ghost">Bỏ</SubmitButton>
                    </form>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel>
        <div id="hooks" className="scroll-mt-20" />
        <PanelHeader
          title="Hook"
          sub={hooks.length ? `${hooks.length} hook · vlog < 1 phút` : undefined}
          tags={<AiBlocked ready={hookAi} />}
          action={
            <form action={aiGenerateHooks} className="shrink-0">
              <input type="hidden" name="research" value={id} />
              <input type="hidden" name="topic" value={topic} />
              <input type="hidden" name="back" value={`${back}#hooks`} />
              <SubmitButton
                variant="soft"
                pendingText="AI đang viết…"
                disabled={!hookAi.ok || counts.usable === 0}
                title={!hookAi.ok ? hookAi.reason : counts.usable === 0 ? "Cần ít nhất một insight đã duyệt" : `AI tạo ${HOOK_COUNT} hook từ insight đã duyệt`}
              >
                <Sparkles size={13} aria-hidden />
                Tạo {HOOK_COUNT} hook
              </SubmitButton>
            </form>
          }
        />
        {hooks.length === 0 ? (
          <EmptyState title="Chưa có hook" hint={counts.usable ? `Bấm Tạo ${HOOK_COUNT} hook.` : "Cần insight đã duyệt trước."} />
        ) : (
          <ol className="m-0 list-none p-0" data-testid="topic-hooks">
            {hooks.slice(0, SHOW).map((h) => (
              <li key={h.id} className="flex items-start gap-3 border-b border-border px-4 py-2.5 last:border-b-0">
                <ScoreTip score={h.score} reasons={h.reasons} kind="hook" className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold text-ink">“{h.hook}”</span>
                    {h.top && <TopPick />}
                    {h.status === "picked" && <Pill tone="jade">{h.contentId ? "Đã có kịch bản" : "Đã chọn"}</Pill>}
                    <span className={cn("num text-[12px]", h.durationSec > 60 ? "text-amber" : "text-ink-3")}>~{h.durationSec}s</span>
                  </div>
                  {h.policyIssues.length > 0 && <p className="mt-0.5 text-[12px] text-brick" title={h.policyIssues.join("\n")}>⚠ {h.policyIssues[0].split(" — ")[0]}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {h.status === "picked" && h.contentId ? (
                    <LinkButton href={`/content?tab=mine&open=${h.contentId}`} variant="outline">Mở kịch bản</LinkButton>
                  ) : h.status !== "new" ? null : (
                    <>
                      <form action={pickHookAction}>
                        <input type="hidden" name="id" value={h.id} />
                        <input type="hidden" name="back" value={`${back}#hooks`} />
                        <SubmitButton pendingText="Đang tạo…">Viết kịch bản</SubmitButton>
                      </form>
                      <form action={rejectHookAction}>
                        <input type="hidden" name="id" value={h.id} />
                        <input type="hidden" name="back" value={`${back}#hooks`} />
                        <SubmitButton variant="ghost">Bỏ</SubmitButton>
                      </form>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
        {hooks.length > 0 && (
          <div className="border-t border-border px-4 py-2.5 text-[12.5px]">
            <Link href={`/content/hooks?research=${id}`} className="font-semibold text-jade hover:underline">{hooks.length > SHOW ? `Tất cả ${hooks.length} hook ›` : "Mở bảng Hook ›"}</Link>
          </div>
        )}
      </Panel>
      <p className="mt-3 text-[12px] text-ink-3"><Link href="/insights/research" className="hover:underline">← Tất cả chủ đề</Link></p>
    </>
  );
}
