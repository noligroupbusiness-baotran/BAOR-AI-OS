import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumb } from "@/components/shell/module-page";
import { PageHead, Panel, PanelHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Th, Td } from "@/components/ui/table";
import { Field, inputClass, textareaClass } from "@/components/ui/field";
import { SubmitButton } from "@/components/campaigns/submit-button";
import { buildBriefAction, createContentFromBriefAction, importResearchAction, runResearchAction } from "@/lib/actions/research";
import { getResearchTask } from "@/lib/research";
import { aiConfigured } from "@/lib/ai";
import { classificationLabel, purposeLabel, sourceTypeLabel, type Classification, type PurposeKind, type SourceType } from "@/lib/knowledge/types";
import { currentActor, can } from "@/lib/permissions";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Nhiệm vụ nghiên cứu – BAOR AI OS" };

function ClassPill({ c }: { c: Classification }) {
  const l = classificationLabel[c];
  return <Pill tone={l?.tone ?? "neutral"}>{l?.label ?? c}</Pill>;
}

export default async function ResearchTaskPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ import?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const r = getResearchTask(id);
  if (!r) notFound();
  const actor = await currentActor();
  const { task, sources, findings, pages, brief } = r;
  const srcById = new Map(sources.map((s) => [s.id, s]));
  const pageById = new Map(pages.map((p) => [p.id, p]));
  const back = `/insights/research/${id}`;
  const okCount = findings.filter((f) => f.verifyOk).length;

  const Refs = ({ sourceIds, knowledgeIds }: { sourceIds: string[]; knowledgeIds: string[] }) => (
    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px]">
      {knowledgeIds.map((k) => {
        const p = pageById.get(k);
        return p ? <a key={k} href={p.url} target="_blank" rel="noreferrer" className="text-violet hover:underline">Second Brain: {p.title} ({p.status})</a> : null;
      })}
      {sourceIds.map((s) => {
        const src = srcById.get(s);
        return src ? <a key={s} href={src.url} target="_blank" rel="noreferrer" className="text-jade hover:underline">{src.publisher || src.title} [{src.grade}]</a> : null;
      })}
      {knowledgeIds.length + sourceIds.length === 0 && <span className="text-ink-3">không có nguồn</span>}
    </div>
  );

  return (
    <>
      <Breadcrumb items={[{ label: "Điều hành", href: "/dashboard" }, { label: "Nghiên cứu", href: "/insights/research" }, { label: "Nhiệm vụ" }]} />
      <PageHead
        title={task.question}
        sub={`${purposeLabel[task.purposeKind as PurposeKind] ?? task.purposeKind}: ${task.purpose}`}
        action={
          <div className="flex flex-wrap gap-2">
            {can(actor, "manager") && aiConfigured() && task.status !== "running" && (
              <form action={runResearchAction}><input type="hidden" name="id" value={id} /><SubmitButton size="md" pendingText="Đang nghiên cứu, có thể mất vài phút…">{task.status === "done" ? "Nghiên cứu lại" : "Chạy nghiên cứu"}</SubmitButton></form>
            )}
            {can(actor, "admin") && <LinkButton href={`${back}?import=1#import`} size="md">Nhập kết quả</LinkButton>}
          </div>
        }
      />

      <div className="grid gap-2.5 md:grid-cols-4">
        {[["Nguồn ngoài", sources.length], ["Phát hiện", findings.length], ["Đạt kiểm", okCount], ["Chi phí AI", task.costVnd ? `${task.costVnd.toLocaleString("vi-VN")} ₫` : "—"]].map(([l, n]) => (
          <div key={String(l)} className="card px-3.5 py-2.5">
            <div className="text-[12px] font-medium text-ink-2">{l}</div>
            <div className="num text-[20px] font-bold leading-tight text-ink">{n}</div>
          </div>
        ))}
      </div>

      {task.error && <div className="mt-3 rounded-md border border-amber/40 bg-amber-soft px-3 py-2 text-[12.5px] text-amber">{task.error}</div>}
      {!aiConfigured() && task.status === "draft" && <div className="mt-3 rounded-md border border-border bg-ground-2 px-3 py-2 text-[12.5px] text-ink-2">Chưa có khóa Claude API nên chưa chạy được trong hệ thống. Kết quả có thể nhập từ phiên Claude (nút Nhập kết quả).</div>}

      {sp.import === "1" && can(actor, "admin") && (
        <Panel id="import">
          <PanelHeader title="Nhập kết quả nghiên cứu (JSON)" sub="Dùng khi nghiên cứu được làm ở phiên Claude bên ngoài. Kết quả vẫn qua luật kiểm như khi chạy trong hệ thống; tham chiếu không xác minh được sẽ bị bỏ." />
          <form action={importResearchAction} className="grid gap-2 p-4">
            <input type="hidden" name="id" value={id} />
            <textarea name="json" rows={10} className={textareaClass} placeholder='{"summary": "...", "sources": [...], "findings": [...], "brief": {...}}' />
            <div className="flex gap-2"><SubmitButton pendingText="Đang nhập…">Nhập</SubmitButton><LinkButton href={back} variant="ghost">Hủy</LinkButton></div>
          </form>
        </Panel>
      )}

      {task.summary && (
        <Panel>
          <PanelHeader title="Tóm tắt" sub={`${task.runner === "import" ? "Nhập từ phiên Claude" : `AI ${task.model ?? ""}`}${task.finishedAt ? ` · ${formatDateTime(task.finishedAt)}` : ""}${task.searchCount ? ` · ${task.searchCount} lượt tìm` : ""}`} />
          <p className="whitespace-pre-line px-4 py-3 text-[13px] leading-relaxed text-ink">{task.summary}</p>
        </Panel>
      )}

      <Panel>
        <PanelHeader title="Phát hiện" sub="Phân loại theo chỉ thị: Sự thật cần nguồn A/B hoặc Second Brain đã xác minh; Quan điểm OWNER chỉ từ trang có nhãn [OWNER]; câu có số liệu phải có nguồn." />
        {findings.length === 0 ? (
          <EmptyState title="Chưa có phát hiện" />
        ) : (
          <ul className="m-0 list-none p-0">
            {findings.map((f) => (
              <li key={f.id} className="border-b border-border px-4 py-3 last:border-b-0">
                <div className="flex flex-wrap items-center gap-2">
                  <ClassPill c={f.classification} />
                  <Pill tone={f.verifyOk ? "jade" : "brick"}>{f.verifyOk ? "Đạt kiểm" : "Chưa đạt"}</Pill>
                  <Pill>tin cậy {f.confidence === "high" ? "cao" : f.confidence === "low" ? "thấp" : "vừa"}</Pill>
                </div>
                <p className="mt-1.5 text-[13px] font-medium leading-relaxed text-ink">{f.statement}</p>
                {f.application && <p className="mt-1 text-[12.5px] text-ink-2"><span className="font-medium text-ink">Ứng dụng:</span> {f.application}</p>}
                {f.counterView && <p className="mt-0.5 text-[12.5px] text-ink-2"><span className="font-medium text-ink">Quan điểm khác:</span> {f.counterView}</p>}
                {f.limits && <p className="mt-0.5 text-[12.5px] text-ink-2"><span className="font-medium text-ink">Giới hạn:</span> {f.limits}</p>}
                <Refs sourceIds={f.sourceIds} knowledgeIds={f.knowledgeIds} />
                {!f.verifyOk && <p className="mt-1 text-[12px] text-brick">{f.verifyNotes.join("; ")}</p>}
                {f.verifyOk && f.verifyNotes.some((n) => n !== "Đạt") && <p className="mt-1 text-[12px] text-amber">{f.verifyNotes.filter((n) => n !== "Đạt").join("; ")}</p>}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel>
        <PanelHeader title="Hồ sơ nguồn ngoài" sub="Hạng A: chính thức/có thẩm quyền · B: đáng tin đã đối chiếu · C: tham khảo · D: chưa kiểm chứng. Ngày để trống khi trang không ghi." />
        {sources.length === 0 ? (
          <EmptyState title="Chưa có nguồn" />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <thead><tr><Th>Nguồn</Th><Th>Tác giả / tổ chức</Th><Th>Ngày</Th><Th>Loại</Th><Th>Hạng</Th></tr></thead>
              <tbody>
                {sources.map((s) => (
                  <tr key={s.id}>
                    <Td className="min-w-[260px]"><a href={s.url} target="_blank" rel="noreferrer" className="font-medium text-ink hover:text-jade hover:underline">{s.title}</a><div className="text-[12px] text-ink-2">{s.excerpt}</div>{s.limits && <div className="text-[12px] text-ink-3">Giới hạn: {s.limits}</div>}</Td>
                    <Td>{[s.author, s.publisher].filter(Boolean).join(" · ") || <span className="text-ink-3">chưa xác định</span>}</Td>
                    <Td className="num">{s.publishedAt ?? <span className="text-ink-3">không ghi</span>}</Td>
                    <Td>{sourceTypeLabel[s.sourceType as SourceType] ?? s.sourceType}</Td>
                    <Td><Pill tone={s.grade === "A" ? "jade" : s.grade === "B" ? "sky" : s.grade === "C" ? "amber" : "brick"}>{s.grade}</Pill></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </Panel>

      <Panel id="brief">
        <PanelHeader title="Content Brief" sub="Kết hợp Second Brain và nguồn ngoài. Máy kiểm từng luận điểm; brief đạt kiểm mới chuyển sang viết kịch bản." />
        {brief ? (
          <div className="grid gap-3 px-4 py-3 text-[13px]">
            <div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-ink">{brief.topic}</span><Pill tone={brief.qa.ok ? "jade" : "amber"}>{brief.qa.ok ? "Đạt kiểm" : "Chưa đạt kiểm"}</Pill>{brief.contentId && <Link href={`/content?tab=mine&open=${brief.contentId}`} className="text-[12.5px] text-jade hover:underline">Mở kịch bản</Link>}</div>
            <div className="grid gap-1 text-ink-2">
              {brief.goal && <div><span className="font-medium text-ink">Mục tiêu:</span> {brief.goal}</div>}
              {brief.audience && <div><span className="font-medium text-ink">Khán giả:</span> {brief.audience}</div>}
              <div><span className="font-medium text-ink">Thông điệp chính:</span> {brief.keyMessage || <span className="text-amber">chưa có</span>}</div>
              {brief.angle && <div><span className="font-medium text-ink">Góc khai thác:</span> {brief.angle}</div>}
            </div>
            <ol className="m-0 grid gap-2 pl-5">
              {brief.points.map((p, i) => (
                <li key={i}><div className="flex flex-wrap items-center gap-2"><ClassPill c={p.classification} /><span className="text-ink">{p.text}</span></div><Refs sourceIds={p.sourceIds} knowledgeIds={p.knowledgeIds} /></li>
              ))}
            </ol>
            {brief.gaps.length > 0 && <div><div className="font-medium text-ink">Còn thiếu</div><ul className="m-0 mt-1 list-disc pl-5 text-ink-2">{brief.gaps.map((g, i) => <li key={i}>{g}</li>)}</ul></div>}
            {!brief.qa.ok && <div className="rounded-md border border-amber/40 bg-amber-soft px-3 py-2 text-[12.5px] text-amber">{brief.qa.issues.join(" · ")}</div>}
            {can(actor, "manager") && !brief.contentId && (
              <form action={createContentFromBriefAction}><input type="hidden" name="briefId" value={brief.id} /><input type="hidden" name="back" value={back} /><SubmitButton pendingText="Đang tạo…" disabled={!brief.qa.ok} title={brief.qa.ok ? undefined : "Brief cần đạt kiểm trước"}>Tạo kịch bản từ brief</SubmitButton></form>
            )}
          </div>
        ) : findings.length > 0 && can(actor, "manager") ? (
          <form action={buildBriefAction} className="grid gap-3 p-4 md:grid-cols-3">
            <input type="hidden" name="id" value={id} />
            <Field label="Chủ đề" required><input name="topic" required className={inputClass} /></Field>
            <Field label="Mục tiêu"><input name="goal" className={inputClass} /></Field>
            <Field label="Khán giả"><input name="audience" className={inputClass} /></Field>
            <div className="md:col-span-3"><SubmitButton pendingText="Đang gom…">Gom brief từ phát hiện đạt kiểm</SubmitButton></div>
          </form>
        ) : (
          <EmptyState title="Chưa có brief" hint="Brief có sau khi nhiệm vụ có phát hiện." />
        )}
      </Panel>
    </>
  );
}
