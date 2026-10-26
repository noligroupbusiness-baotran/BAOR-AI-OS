import Link from "next/link";
import { PageHead, Panel, PanelHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, inputClass } from "@/components/ui/field";
import { SubmitButton } from "@/components/campaigns/submit-button";
import { platformLabel } from "@/components/ui/platform";
import { addManualHook, aiGenerateHooks, pickHookAction, rejectHookAction } from "@/lib/actions/hooks";
import { HOOK_COUNT, HOOK_PLATFORMS, hookStubs, listHooks, needsRealStory } from "@/lib/content/hooks";
import { scoreHooks, topicIdsByName, hookTopicId, type ScoredHook } from "@/lib/content/priority";
import { getResearchTask } from "@/lib/research";
import { roleById } from "@/lib/ai-roster";
import { AI_TEAM_HREF, aiReadiness } from "@/lib/ai";
import { AiBlocked } from "@/components/ui/ai-blocked";
import { ScoreTip, TopPick } from "@/components/ui/score-tip";
import { getDb, schema } from "@/db";
import { formatDateTime, cn } from "@/lib/format";
import type { Platform } from "@/lib/types";

export const metadata = { title: "Bảng Hook & kịch bản – BAOR AI OS" };

const basisLabel = { finding: "Nghiên cứu", knowledge: "Kiến thức", insight: "Insight" } as const;
const chip = (on: boolean) => cn("rounded-full border px-2.5 py-0.5 whitespace-nowrap", on ? "border-jade/40 bg-jade-soft font-semibold text-jade-ink" : "border-border-2 text-ink-2 hover:bg-ground-2");

// Bước 2 (Hook & kịch bản). OWNER 26/10: mỗi lô hook ghi rõ chủ đề gốc (link về bước 1), lọc theo chủ đề, chấm điểm ưu tiên,
// "Nên làm" cho 3 hook tốt nhất, "Viết kịch bản" một chạm (khung vlog chia sẻ < 1 phút).
export default async function HooksPage({ searchParams }: { searchParams: Promise<{ topic?: string; all?: string; research?: string }> }) {
  const sp = await searchParams;
  const role = roleById("hooks")!;
  const ready = aiReadiness("ideas");
  const byName = topicIdsByName();
  const visible = (status: string) => sp.all === "1" || status !== "rejected";
  // Chủ đề có hook (để lọc): tên lấy từ chủ đề nghiên cứu; đếm trên MỌI hook (bản gọn)
  const topicNames = new Map(getDb().select({ id: schema.researchTasks.id, q: schema.researchTasks.question }).from(schema.researchTasks).all().map((t) => [t.id, t.q.replace(/^Chủ đề: /, "")]));
  const perTopic = new Map<string, number>();
  let total = 0;
  for (const h of hookStubs()) {
    if (!visible(h.status)) continue;
    total++;
    const t = hookTopicId(h, byName);
    if (t && topicNames.has(t)) perTopic.set(t, (perTopic.get(t) ?? 0) + 1);
  }
  const filter = sp.research && topicNames.has(sp.research) ? sp.research : null;
  // Lọc theo chủ đề: truy theo research_id (không bị giới hạn 500 hook mới nhất)
  const raw = (filter ? listHooks(2000, { topic: filter }) : listHooks(500)).filter((h) => visible(h.status));
  const research = filter ? getResearchTask(filter) : null;
  const filterName = filter ? (topicNames.get(filter) ?? "") : "";
  const hooks = scoreHooks(filter ? raw.filter((h) => hookTopicId(h, byName) === filter) : raw, { byName });
  const batches = new Map<string, ScoredHook[]>();
  for (const h of [...hooks].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) batches.set(h.batchId, []);
  for (const h of hooks) batches.get(h.batchId)!.push(h); // trong lô: điểm cao trước
  const q = (extra: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ research: filter ?? undefined, all: sp.all, ...extra })) if (v) u.set(k, v);
    const s = u.toString();
    return `/content/hooks${s ? `?${s}` : ""}`;
  };
  const back = q({});

  return (
    <>
      <PageHead title="Bảng Hook & kịch bản" sub={`${HOOK_COUNT} hook mỗi lần · vlog chia sẻ < 1 phút · kiểm luật nền tảng`} />

      {perTopic.size > 0 && (
        <nav aria-label="Lọc theo chủ đề" className="appear appear--soft -mt-2 mb-3 flex flex-wrap items-center gap-1.5 text-[12px] [--d:1]">
          <Link href={q({ research: "" })} className={chip(!filter)}>Tất cả · {total}</Link>
          {[...perTopic.entries()].sort((a, b) => b[1] - a[1]).map(([id, n]) => (
            <Link key={id} href={q({ research: id })} className={cn(chip(filter === id), "max-w-[220px] overflow-hidden text-ellipsis")} title={topicNames.get(id)}>{topicNames.get(id)} · {n}</Link>
          ))}
        </nav>
      )}

      <Panel>
        <PanelHeader
          title="AI tạo hook"
          sub={filter ? `Từ insight của “${filterName.slice(0, 40)}”` : role.name}
          tags={<AiBlocked ready={ready} />}
          action={filter ? <Link href={`/insights/research/${filter}`} className="text-[12.5px] font-semibold text-jade hover:underline">← Chủ đề</Link> : <Link href={AI_TEAM_HREF} className="text-[12.5px] font-semibold text-jade">Đội AI ›</Link>}
        />
        <form action={aiGenerateHooks} className="grid gap-2 p-4 md:grid-cols-[1fr_auto] md:items-end">
          {filter && <input type="hidden" name="research" value={filter} />}
          <Field label={filter ? "Chủ đề" : "Chủ đề marketing (OWNER đề xuất)"}>
            <input name="topic" required minLength={4} defaultValue={sp.topic ?? (research ? filterName : "")} placeholder="vd: chào hỏi phá băng khi gọi điện cho khách mới" className={inputClass} />
          </Field>
          <SubmitButton pendingText="AI đang viết 10 hook…" disabled={!ready.ok} title={ready.ok ? undefined : ready.reason}>AI tạo {HOOK_COUNT} hook</SubmitButton>
        </form>
        <details className="border-t border-border px-4 py-3">
          <summary className="cursor-pointer text-[13px] font-semibold text-ink">Thêm hook tay (không dùng AI)</summary>
          <form action={addManualHook} className="mt-3 grid gap-2">
            {filter && <input type="hidden" name="research" value={filter} />}
            <div className="grid gap-2 md:grid-cols-2">
              <Field label="Chủ đề"><input name="topic" defaultValue={filterName} className={inputClass} /></Field>
              <Field label="Thời lượng (giây)"><input name="durationSec" inputMode="numeric" defaultValue={45} className={inputClass} /></Field>
            </div>
            <Field label="Hook (câu nói 3 giây đầu)"><input name="hook" required className={inputClass} /></Field>
            <Field label="Góc tiếp cận"><input name="angle" className={inputClass} /></Field>
            <Field label="Dàn ý: chuyện · bài học · kết (mỗi dòng một nhịp)"><textarea name="beats" rows={3} className={inputClass} /></Field>
            <div className="flex flex-wrap gap-3 text-[12.5px]">
              {HOOK_PLATFORMS.map((p) => (
                <label key={p} className="flex items-center gap-1.5"><input type="checkbox" name={`p_${p}`} defaultChecked />{platformLabel(p as Platform)}</label>
              ))}
            </div>
            <div><SubmitButton>Thêm hook</SubmitButton></div>
          </form>
        </details>
      </Panel>

      {batches.size === 0 ? (
        <Panel>
          <EmptyState title="Chưa có hook nào" hint={filter ? "Bấm AI tạo hook cho chủ đề này." : "Nhập chủ đề rồi bấm AI tạo hook, hoặc thêm hook tay."} />
        </Panel>
      ) : (
        [...batches.entries()].map(([batchId, rows]) => {
          const first = rows[0];
          const tName = first.topicId ? topicNames.get(first.topicId) : undefined;
          return (
            <Panel key={batchId}>
              <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border px-4 py-3">
                <div className="min-w-0">
                  {first.topicId && tName ? (
                    <Link href={`/insights/research/${first.topicId}`} className="text-[13px] font-bold text-ink hover:underline" data-testid="hook-topic-link">
                      <span className="font-normal text-ink-3">Chủ đề › </span>{first.topic || tName}
                    </Link>
                  ) : (
                    <h2 className="text-[13px] font-bold text-ink">{first.topic || "(không ghi chủ đề)"}</h2>
                  )}
                  <p className="mt-px text-[12px] text-ink-2">{rows.length} hook · {first.source === "ai" ? "AI" : "nhập tay"} · {formatDateTime(first.createdAt)}</p>
                </div>
              </header>
              <ol className="m-0 list-none p-0">
                {rows.map((h) => (
                  <li key={h.id} className={cn("grid gap-2 border-b border-border px-4 py-3 last:border-b-0 md:grid-cols-[minmax(0,1fr)_auto]", h.status === "rejected" && "opacity-50")}>
                    <div className="flex min-w-0 items-start gap-3">
                      <ScoreTip score={h.score} reasons={h.reasons} kind="hook" className="mt-0.5" />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="font-semibold text-ink">“{h.hook}”</span>
                          {h.top && <TopPick />}
                          <span className={cn("num text-[12px]", h.durationSec > 60 ? "text-amber" : "text-ink-2")}>~{h.durationSec}s</span>
                          {h.status === "picked" && <Pill tone="jade">{h.contentId ? "Đã có kịch bản" : "Đã chọn"}</Pill>}
                          {needsRealStory(h.basis) ? (
                            <span title="Chưa có tư liệu kinh nghiệm của anh — vlog cần anh kể chuyện thật">
                              <Pill tone="amber">cần chuyện thật</Pill>
                            </span>
                          ) : (
                            <Pill tone="violet">Chuyện của anh</Pill>
                          )}
                        </div>
                        {h.angle && <p className="mt-0.5 text-[12.5px] text-ink-2">{h.angle}</p>}
                        {h.beats.length > 0 && (
                          <ul className="mt-1 list-disc pl-5 text-[12.5px] text-ink">
                            {h.beats.map((b, k) => <li key={k}>{b}</li>)}
                          </ul>
                        )}
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {h.platforms.map((p) => <Pill key={p} tone="neutral">{platformLabel(p as Platform)}</Pill>)}
                          {h.basis.map((b) =>
                            b.kind === "finding" && h.topicId ? (
                              <Link key={`${b.kind}:${b.id}`} href={`/insights/research/${h.topicId}#insights`} title={b.label} className="max-w-full">
                                <Pill tone="sky" className="max-w-full overflow-hidden text-ellipsis hover:underline">{basisLabel[b.kind]}: {b.label.slice(0, 40)}</Pill>
                              </Link>
                            ) : (
                              <Pill key={`${b.kind}:${b.id}`} tone="sky" className="max-w-full overflow-hidden text-ellipsis">{basisLabel[b.kind]}: {b.label.slice(0, 40)}</Pill>
                            ),
                          )}
                        </div>
                        {h.policyIssues.length > 0 && (
                          <ul className="mt-1.5 list-none p-0 text-[12px] text-brick">
                            {h.policyIssues.map((x, k) => <li key={k}>⚠ {x}</li>)}
                          </ul>
                        )}
                      </div>
                    </div>
                    <div className="flex items-start gap-1.5 md:justify-end">
                      {h.status === "picked" && h.contentId ? (
                        <Link href={`/content?tab=mine&open=${h.contentId}`} className="text-[12.5px] font-semibold text-jade hover:underline">Mở kịch bản ›</Link>
                      ) : h.status === "new" ? (
                        <>
                          <form action={pickHookAction}><input type="hidden" name="id" value={h.id} /><input type="hidden" name="back" value={back} /><SubmitButton pendingText="Đang tạo…">Viết kịch bản</SubmitButton></form>
                          <form action={rejectHookAction}><input type="hidden" name="id" value={h.id} /><input type="hidden" name="back" value={back} /><SubmitButton variant="ghost">Bỏ</SubmitButton></form>
                        </>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            </Panel>
          );
        })
      )}
      <p className="mt-3 text-[12px] text-ink-3"><Link href={q({ all: sp.all === "1" ? "" : "1" })} className="hover:underline">{sp.all === "1" ? "Ẩn hook đã bỏ" : "Hiện cả hook đã bỏ"}</Link></p>
    </>
  );
}
