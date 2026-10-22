import { Breadcrumb } from "@/components/shell/module-page";
import { PageHead, Panel, PanelHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmAction } from "@/components/campaigns/confirm-action";
import { decideProposalAction, markExportedAction, refreshLearningAction } from "@/lib/actions/learning";
import { analyzeAll, listProposals, secondBrainDraft } from "@/lib/learning";
import { topicPerformance, MIN_POSTS_PER_TOPIC, MIN_VIEWS } from "@/lib/learning/analyze";
import { gatherPosts } from "@/lib/learning";
import { formatDateTime, formatNumber } from "@/lib/format";

export const metadata = { title: "Học & cải tiến – BAOR AI OS" };

const targetLabel: Record<string, string> = { content: "Nội dung", second_brain: "Second Brain", video_skill: "Skill dựng video", ads: "Quảng cáo" };
const statusLabel: Record<string, { label: string; tone: "amber" | "jade" | "neutral" | "violet" }> = {
  proposed: { label: "Chờ OWNER", tone: "amber" },
  accepted: { label: "Đã chấp nhận", tone: "jade" },
  rejected: { label: "Đã bỏ qua", tone: "neutral" },
  exported: { label: "Đã chuyển hộp chờ duyệt", tone: "violet" },
};

// CP06: số liệu thật → phân tích → đề xuất (giả thuyết) → OWNER quyết → Second Brain / Skill.
export default async function LearningPage() {
  const { facts } = analyzeAll();
  const topics = topicPerformance(gatherPosts());
  const proposals = listProposals();
  const draft = secondBrainDraft();
  return (
    <>
      <Breadcrumb items={[{ label: "Điều hành", href: "/dashboard" }, { label: "Học & cải tiến" }]} />
      <PageHead
        title="Học & cải tiến"
        sub="Đọc kết quả thật (bài đã đăng và xác minh, video, quảng cáo, brief), tìm điều lặp lại, đề xuất cải tiến nội dung, Second Brain và Skill dựng video. Mọi đề xuất là giả thuyết cho tới khi OWNER chấp nhận; hệ thống không tự sửa kho tri thức hay skill."
        action={<form action={refreshLearningAction}><Button type="submit" variant="primary" size="md">Phân tích lại</Button></form>}
      />

      <Panel>
        <PanelHeader title="Dữ liệu dùng để phân tích" sub={`Chỉ dữ liệu thật; dữ liệu mẫu bị loại. So sánh chủ đề cần từ ${MIN_POSTS_PER_TOPIC} bài và ${MIN_VIEWS} lượt xem trung bình.`} />
        <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-5">
          {[["Bài đã đăng thật", facts.posts], ["Bản dựng có bảng kiểm", facts.reports], ["Yêu cầu sửa video", facts.feedback], ["Quảng cáo thật", facts.ads], ["Brief nghiên cứu", facts.briefs]].map(([l, n]) => (
            <div key={String(l)} className="bg-surface px-4 py-3"><div className="text-[12px] text-ink-2">{l}</div><div className="num text-[20px] font-bold text-ink">{n}</div></div>
          ))}
        </div>
        {topics.length > 0 && (
          <ul className="m-0 list-none border-t border-border p-0 text-[12.5px]">
            {topics.map((t) => (
              <li key={t.topic} className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2 last:border-b-0">
                <span className="text-ink">{t.topic}</span>
                <span className="text-ink-2"><span className="num">{t.posts}</span> bài · <span className="num">{formatNumber(t.avgViews)}</span> lượt xem TB{t.avgEngagementRate != null ? ` · ${t.avgEngagementRate}% tương tác` : ""} {t.enough ? <Pill tone="jade">đủ mẫu</Pill> : <Pill>chưa đủ dữ liệu</Pill>}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel>
        <PanelHeader title="Đề xuất cải tiến" sub="Mỗi đề xuất có căn cứ và cỡ mẫu. Chỉ OWNER chấp nhận hoặc bỏ qua." />
        {proposals.length === 0 ? (
          <EmptyState title="Chưa có đề xuất" hint="Cần thêm bài đăng thật, bản dựng hoặc brief để thấy điều lặp lại. Bấm Phân tích lại sau khi có số liệu." />
        ) : (
          <ul className="m-0 list-none p-0">
            {proposals.map((p) => {
              const st = statusLabel[p.status] ?? statusLabel.proposed;
              return (
                <li key={p.id} className="grid gap-1.5 border-b border-border px-4 py-3 last:border-b-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone="violet">{targetLabel[p.target] ?? p.target}</Pill>
                    <span className="text-[13.5px] font-semibold text-ink">{p.title}</span>
                    <Pill tone={st.tone}>{st.label}</Pill>
                    <span className="text-[11.5px] text-ink-3">giả thuyết · tin cậy {p.confidence} · mẫu {p.sampleSize} · {formatDateTime(p.updatedAt)}</span>
                  </div>
                  <p className="m-0 text-[12.5px] text-ink">{p.detail}</p>
                  {p.evidence.length > 0 && <ul className="m-0 list-disc pl-5 text-[12px] text-ink-2">{p.evidence.map((e) => <li key={e}>{e}</li>)}</ul>}
                  {p.note && <div className="text-[12px] text-ink-2">Ghi chú OWNER: {p.note}</div>}
                  {p.status === "proposed" && (
                    <div className="flex gap-1.5">
                      <ConfirmAction action={decideProposalAction} fields={{ id: p.id, decision: "accepted" }} label="Chấp nhận" title="Chấp nhận đề xuất?" message="Đề xuất được đưa vào bản nháp cho hộp chờ duyệt (Second Brain / Skill). Không tự sửa kho." confirmLabel="Chấp nhận" variant="soft" withNote={{ label: "Ghi chú (tùy chọn)" }} />
                      <ConfirmAction action={decideProposalAction} fields={{ id: p.id, decision: "rejected" }} label="Bỏ qua" title="Bỏ qua đề xuất?" message="Đề xuất giữ trong lịch sử, không dùng." confirmLabel="Bỏ qua" variant="ghost" withNote={{ label: "Lý do (tùy chọn)" }} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel>
        <PanelHeader
          title="Bản nháp cho hộp chờ duyệt Second Brain"
          sub="Chỉ gồm đề xuất OWNER đã chấp nhận, ghi rõ DRAFT và [AI SUY LUẬN]. Ứng dụng chưa có quyền ghi Notion: sao chép vào 07 HỘP CHỜ DUYỆT, rồi đánh dấu đã chuyển."
          action={draft ? <form action={markExportedAction}><Button type="submit" variant="ghost">Đánh dấu đã chuyển</Button></form> : undefined}
        />
        {draft ? <pre className="m-0 max-h-[420px] overflow-auto whitespace-pre-wrap px-4 py-3 text-[12px] text-ink">{draft}</pre> : <EmptyState title="Chưa có đề xuất được chấp nhận" />}
      </Panel>
    </>
  );
}
