import Link from "next/link";
import { Breadcrumb } from "@/components/shell/module-page";
import { PageHead, Panel, PanelHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, inputClass, textareaClass } from "@/components/ui/field";
import { SubmitButton } from "@/components/campaigns/submit-button";
import { createResearchTaskAction } from "@/lib/actions/research";
import { listResearchTasks, suggestTopics } from "@/lib/research";
import { aiConfigured } from "@/lib/ai";
import { PURPOSE_KINDS, purposeLabel, type PurposeKind } from "@/lib/knowledge/types";
import { listContent } from "@/lib/queries";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Nghiên cứu – BAOR AI OS" };

const statusLabel: Record<string, { label: string; tone: "neutral" | "amber" | "jade" | "brick" }> = {
  draft: { label: "Chưa chạy", tone: "neutral" },
  running: { label: "Đang nghiên cứu", tone: "amber" },
  done: { label: "Xong", tone: "jade" },
  error: { label: "Lỗi", tone: "brick" },
};

export default async function ResearchListPage({ searchParams }: { searchParams: Promise<{ content?: string; topic?: string }> }) {
  const sp = await searchParams;
  const tasks = listResearchTasks();
  const topics = suggestTopics(8);
  const topic = (sp.topic ?? "").slice(0, 200);
  const contents = listContent().filter((c) => c.status !== "dismissed" && c.status !== "published").slice(0, 50);
  const ai = aiConfigured();
  return (
    <>
      <Breadcrumb items={[{ label: "Điều hành", href: "/dashboard" }, { label: "Nghiên cứu" }]} />
      <PageHead
        title="Nghiên cứu"
        sub="Mỗi nhiệm vụ trả lời một câu hỏi phục vụ mục tiêu cụ thể. Hệ thống đọc Second Brain trước, tìm nguồn ngoài cho phần còn thiếu, phân loại từng phát hiện và kiểm theo luật trước khi đưa vào brief."
        action={<LinkButton href="/insights/knowledge" size="md">Second Brain</LinkButton>}
      />

      {topics.length > 0 && (
        <Panel>
          <PanelHeader title="Chủ đề đề xuất" sub="Theo luật, không AI: chủ đề phát hiện đạt kiểm đã gợi ý, và trang Second Brain chưa có nội dung nào dùng. Bấm để điền sẵn nhiệm vụ nghiên cứu." />
          <ul className="m-0 grid list-none gap-px bg-border p-0 sm:grid-cols-2">
            {topics.map((t) => (
              <li key={t.from + t.refId + t.topic} className="flex items-start justify-between gap-3 bg-surface px-4 py-2.5">
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-ink">{t.topic}</div>
                  <div className="text-[11.5px] text-ink-2">{t.why}{t.status === "DRAFT" ? " · trang còn DRAFT" : ""}</div>
                </div>
                <LinkButton href={`/insights/research?topic=${encodeURIComponent(t.topic)}#tao-nhiem-vu`} variant="soft">Nghiên cứu</LinkButton>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel id="tao-nhiem-vu">
        <PanelHeader title="Nhiệm vụ mới" sub={ai ? "Chạy bằng Claude có tìm kiếm web; tối đa 8 lượt tìm mỗi nhiệm vụ, tính vào trần chi phí AI." : "Chưa có khóa Claude API: vẫn tạo được nhiệm vụ; kết quả nghiên cứu nhập từ phiên Claude bên ngoài cho tới khi có khóa."} />
        <form action={createResearchTaskAction} className="grid gap-3 p-4 md:grid-cols-2">
          <Field label="Câu hỏi nghiên cứu" required className="md:col-span-2">
            <input name="question" required minLength={8} defaultValue={topic ? `Nên truyền tải “${topic}” thế nào trong một video ngắn để người xem áp dụng được ngay?` : undefined} className={inputClass} placeholder="VD: Mở đầu cuộc gọi tư vấn thế nào để khách không cúp máy trong 30 giây đầu?" />
          </Field>
          <Field label="Mục tiêu sử dụng" required>
            <select name="purposeKind" required defaultValue={sp.content || topic ? "content" : ""} className={inputClass}>
              <option value="" disabled>Chọn</option>
              {PURPOSE_KINDS.map((k) => <option key={k} value={k}>{purposeLabel[k as PurposeKind]}</option>)}
            </select>
          </Field>
          <Field label="Nội dung liên quan (nếu có)">
            <select name="contentId" defaultValue={sp.content ?? ""} className={inputClass}>
              <option value="">Không gắn</option>
              {contents.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </Field>
          <Field label="Nghiên cứu này phục vụ việc gì" required className="md:col-span-2">
            <textarea name="purpose" required rows={2} defaultValue={topic ? `Kịch bản video ngắn về “${topic}” cho kênh thương hiệu cá nhân` : undefined} className={textareaClass} placeholder="VD: Kịch bản video B1 Chào hỏi phá băng cho học viên Sales mới" />
          </Field>
          <div className="md:col-span-2"><SubmitButton pendingText="Đang tạo…">Tạo nhiệm vụ</SubmitButton></div>
        </form>
      </Panel>

      <Panel>
        <PanelHeader title="Nhiệm vụ nghiên cứu" sub="Không đánh giá bằng số tài liệu thu được; đánh giá bằng phát hiện đạt kiểm và brief dùng được." />
        {tasks.length === 0 ? (
          <EmptyState title="Chưa có nhiệm vụ nào" hint="Tạo nhiệm vụ đầu tiên ở trên." />
        ) : (
          <ul className="m-0 list-none p-0">
            {tasks.map((t) => {
              const st = statusLabel[t.status] ?? statusLabel.draft;
              return (
                <li key={t.id} className="grid gap-1 border-b border-border px-4 py-2.5 last:border-b-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/insights/research/${t.id}`} className="text-[13.5px] font-semibold text-ink hover:text-jade hover:underline">{t.question}</Link>
                    <Pill tone={st.tone}>{st.label}</Pill>
                    {t.runner === "import" && t.status === "done" && <Pill>nhập từ phiên Claude</Pill>}
                    {t.briefId && <Pill tone="violet">có brief</Pill>}
                  </div>
                  <div className="text-[12px] text-ink-2">
                    {purposeLabel[t.purposeKind as PurposeKind] ?? t.purposeKind} · {t.purpose} · <span className="num">{t.sourceCount}</span> nguồn · <span className="num">{t.findingCount}</span> phát hiện · <span className="num">{formatDateTime(t.createdAt)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </>
  );
}
