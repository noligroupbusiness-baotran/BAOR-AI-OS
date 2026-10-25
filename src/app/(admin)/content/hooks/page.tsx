import Link from "next/link";
import { Breadcrumb } from "@/components/shell/module-page";
import { PageHead, Panel, PanelHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, inputClass } from "@/components/ui/field";
import { SubmitButton } from "@/components/campaigns/submit-button";
import { platformLabel } from "@/components/ui/platform";
import { addManualHook, aiGenerateHooks, pickHookAction, rejectHookAction } from "@/lib/actions/hooks";
import { HOOK_COUNT, HOOK_PLATFORMS, listHooks, type HookRow } from "@/lib/content/hooks";
import { roleAllows, roleById } from "@/lib/ai-roster";
import { aiConfigured } from "@/lib/ai";
import { formatDateTime, cn } from "@/lib/format";
import type { Platform } from "@/lib/types";

export const metadata = { title: "Bảng Hook & kịch bản – BAOR AI OS" };

const basisLabel = { finding: "Nghiên cứu", knowledge: "Second Brain", insight: "Insight" } as const;

export default async function HooksPage({ searchParams }: { searchParams: Promise<{ topic?: string; all?: string }> }) {
  const sp = await searchParams;
  const role = roleById("hooks")!;
  const allowed = roleAllows(role);
  const hooks = listHooks().filter((h) => sp.all === "1" || h.status !== "rejected");
  const batches = new Map<string, HookRow[]>();
  for (const h of hooks) batches.set(h.batchId, [...(batches.get(h.batchId) ?? []), h]);

  return (
    <>
      <Breadcrumb items={[{ label: "Điều hành", href: "/dashboard" }, { label: "Kịch bản & nội dung", href: "/content" }, { label: "Bảng Hook" }]} />
      <PageHead
        title="Bảng Hook & kịch bản video ngắn"
        sub={`Mỗi lần AI trả ${HOOK_COUNT} hook kèm dàn ý (< 3 phút), dựa trên phát hiện nghiên cứu đã kiểm, Second Brain và insight đã duyệt. Mỗi hook được kiểm luật ngôn từ theo nền tảng. Chọn hook nào thì tạo kịch bản từ hook đó.`}
      />

      <Panel>
        <PanelHeader title="AI tạo hook" sub={`${role.name} · ${allowed.ok ? (aiConfigured() ? "được phép gọi AI" : "chưa có khoá Claude API (Cài đặt › Kết nối)") : allowed.reason}`} action={<Link href="/settings#ai-team" className="text-[12.5px] font-semibold text-accent">Đội AI ›</Link>} />
        <form action={aiGenerateHooks} className="grid gap-2 p-4 md:grid-cols-[1fr_auto] md:items-end">
          <Field label="Chủ đề marketing (OWNER đề xuất)">
            <input name="topic" required minLength={4} defaultValue={sp.topic ?? ""} placeholder="vd: chào hỏi phá băng khi gọi điện cho khách mới" className={inputClass} />
          </Field>
          <SubmitButton pendingText="AI đang viết 10 hook…">AI tạo {HOOK_COUNT} hook</SubmitButton>
        </form>
        <details className="border-t border-border px-4 py-3">
          <summary className="cursor-pointer text-[13px] font-semibold text-ink">Thêm hook tay (không dùng AI)</summary>
          <form action={addManualHook} className="mt-3 grid gap-2">
            <div className="grid gap-2 md:grid-cols-2">
              <Field label="Chủ đề"><input name="topic" className={inputClass} /></Field>
              <Field label="Thời lượng (giây)"><input name="durationSec" inputMode="numeric" defaultValue={60} className={inputClass} /></Field>
            </div>
            <Field label="Hook (câu nói 3 giây đầu)"><input name="hook" required className={inputClass} /></Field>
            <Field label="Góc tiếp cận"><input name="angle" className={inputClass} /></Field>
            <Field label="Dàn ý (mỗi dòng một nhịp)"><textarea name="beats" rows={4} className={inputClass} /></Field>
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
          <EmptyState title="Chưa có hook nào" hint="Nhập chủ đề rồi bấm AI tạo hook, hoặc thêm hook tay." />
        </Panel>
      ) : (
        [...batches.entries()].map(([batchId, rows]) => (
          <Panel key={batchId}>
            <PanelHeader title={rows[0].topic || "(không ghi chủ đề)"} sub={`${rows.length} hook · ${rows[0].source === "ai" ? "AI" : "nhập tay"} · ${rows[0].createdBy} · ${formatDateTime(rows[0].createdAt)}`} />
            <ol className="m-0 list-none p-0">
              {rows.map((h, i) => (
                <li key={h.id} className={cn("grid gap-2 border-b border-border px-4 py-3 last:border-b-0 md:grid-cols-[minmax(0,1fr)_auto]", h.status === "rejected" && "opacity-50")}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="num text-[12px] text-ink-3">{i + 1}</span>
                      <span className="font-semibold text-ink">“{h.hook}”</span>
                      <span className="num text-[12px] text-ink-2">~{h.durationSec}s</span>
                      {h.status === "picked" && <Pill tone="jade">Đã chọn</Pill>}
                    </div>
                    {h.angle && <p className="mt-0.5 text-[12.5px] text-ink-2">{h.angle}</p>}
                    {h.beats.length > 0 && (
                      <ul className="mt-1 list-disc pl-5 text-[12.5px] text-ink">
                        {h.beats.map((b, k) => <li key={k}>{b}</li>)}
                      </ul>
                    )}
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {h.platforms.map((p) => <Pill key={p} tone="neutral">{platformLabel(p as Platform)}</Pill>)}
                      {h.basis.map((b) => <Pill key={`${b.kind}:${b.id}`} tone="sky" className="max-w-full overflow-hidden text-ellipsis">{basisLabel[b.kind]}: {b.label.slice(0, 40)}</Pill>)}
                    </div>
                    {h.policyIssues.length > 0 && (
                      <ul className="mt-1.5 list-none p-0 text-[12px] text-brick">
                        {h.policyIssues.map((x, k) => <li key={k}>⚠ {x}</li>)}
                      </ul>
                    )}
                  </div>
                  <div className="flex items-start gap-1.5">
                    {h.status === "picked" && h.contentId ? (
                      <Link href={`/content?tab=mine&open=${h.contentId}`} className="text-[12.5px] font-semibold text-accent">Mở kịch bản ›</Link>
                    ) : h.status === "new" ? (
                      <>
                        <form action={pickHookAction}><input type="hidden" name="id" value={h.id} /><SubmitButton>Chọn → kịch bản</SubmitButton></form>
                        <form action={rejectHookAction}><input type="hidden" name="id" value={h.id} /><SubmitButton variant="ghost">Bỏ</SubmitButton></form>
                      </>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          </Panel>
        ))
      )}
      <p className="mt-3 text-[12px] text-ink-3"><Link href={sp.all === "1" ? "/content/hooks" : "/content/hooks?all=1"} className="hover:underline">{sp.all === "1" ? "Ẩn hook đã bỏ" : "Hiện cả hook đã bỏ"}</Link></p>
    </>
  );
}
