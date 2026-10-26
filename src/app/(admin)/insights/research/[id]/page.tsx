import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, Sparkles } from "lucide-react";
import { PageHead, Panel, PanelHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { textareaClass } from "@/components/ui/field";
import { SubmitButton } from "@/components/campaigns/submit-button";
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
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Chủ đề nghiên cứu – BAOR AI OS" };

// Trang chủ đề (bước 2), bản tối giản (OWNER 26/10): MỘT hàng nền tảng + link + "Phân tích" (hệ thống tự đọc bình luận), MỘT nút
// "AI tìm nỗi đau khách" (YouTube + web Việt Nam), ô dán bình luận chỉ mở khi link không đọc tự động được. → Tạo 10 hook (bước 3).
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
  const groups = new Map<string, typeof insights>();
  for (const i of insights) groups.set(i.platform, [...(groups.get(i.platform) ?? []), i]);

  return (
    <>
      <PageHead
        title={topic}
        sub={`${insights.length} insight${pendingCount ? ` · ${pendingCount} chờ duyệt` : ""}`}
        action={<LinkButton href={`/content/hooks?research=${id}&topic=${encodeURIComponent(topic)}`} variant="primary" size="md">Tạo 10 hook từ insight</LinkButton>}
      />

      <Panel>
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
        <PanelHeader title="Insight" />
        {insights.length === 0 ? (
          <EmptyState title="Chưa có insight" hint="Dán link bài / video rồi bấm Phân tích." />
        ) : (
          [...groups.entries()].map(([platform, list]) => (
            <div key={platform} className="border-b border-border last:border-b-0">
              <h3 className="px-4 pt-3 text-[11.5px] font-semibold uppercase tracking-wide text-ink-3">{platform}</h3>
              <ul className="m-0 list-none p-0">
                {list.map((i) => (
                  <li key={i.id} className="flex items-start gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] leading-relaxed text-ink">{i.statement}</p>
                      {i.application && <p className="mt-0.5 text-[12.5px] text-ink-2">→ {i.application}</p>}
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
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
            </div>
          ))
        )}
      </Panel>
      <p className="mt-3 text-[12px] text-ink-3"><Link href="/insights/research" className="hover:underline">← Tất cả chủ đề</Link></p>
    </>
  );
}
