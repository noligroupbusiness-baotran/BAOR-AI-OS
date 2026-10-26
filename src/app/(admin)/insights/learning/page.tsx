import { PageHead, Panel, PanelHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmAction } from "@/components/campaigns/confirm-action";
import { aiReviewAction, decideProposalAction, refreshLearningAction } from "@/lib/actions/learning";
import { captionSkill } from "@/lib/publishing/caption";
import { roleAllows, roleById } from "@/lib/ai-roster";
import { analyzeAll, listOpenProposals } from "@/lib/learning";
import { topicPerformance, MIN_POSTS_PER_TOPIC, MIN_VIEWS } from "@/lib/learning/analyze";
import { gatherPosts } from "@/lib/learning";
import { formatDateTime, formatNumber } from "@/lib/format";
import { Segment } from "@/components/ui/segment";
import { displayStepsIn } from "@/config/journey";
import { ReportsView } from "@/components/reports/reports-view";

export const metadata = { title: "Đo lường – BAOR AI OS" };

const TABS = [
  { key: "cai-tien", label: "Cải tiến" },
  { key: "so-lieu", label: "Số liệu" },
];

// Đề xuất đã lưu trước đợt đổi tên (26/10/2026) còn "bước 8.1 / 8.2" và "Second Brain": chuẩn hoá lúc hiển thị.
const shown = (s: string) => displayStepsIn(s).replace(/Second Brain/g, "Kiến thức");

const targetLabel: Record<string, string> = { content: "Nội dung", second_brain: "Kiến thức", video_skill: "Skill dựng video", ads: "Quảng cáo" };
const statusLabel: Record<string, { label: string; tone: "amber" | "jade" | "neutral" | "violet" }> = {
  proposed: { label: "Chờ OWNER", tone: "amber" },
  accepted: { label: "Đã chấp nhận", tone: "jade" },
  rejected: { label: "Đã bỏ qua", tone: "neutral" },
  exported: { label: "Đã chuyển", tone: "violet" },
};

// CP06: số liệu thật → phân tích → đề xuất (giả thuyết) → OWNER quyết → Second Brain / Skill.
// Hai tab (OWNER 26/10/2026): "Cải tiến" (mặc định) | "Số liệu" (trang /reports cũ, tab con ?view=).
export default async function LearningPage({ searchParams }: { searchParams: Promise<{ tab?: string; view?: string; month?: string; campaign?: string }> }) {
  const sp = await searchParams;
  if (sp.tab === "so-lieu") {
    return (
      <>
        <PageHead title="Đo lường & cải tiến" />
        <Segment basePath="/insights/learning" active="so-lieu" items={TABS} />
        <ReportsView sp={sp} />
      </>
    );
  }
  const { facts, proposals: live } = analyzeAll();
  const topics = topicPerformance(gatherPosts());
  // Ẩn đề xuất chờ duyệt đã cũ / đã được quyết / trỏ video đã xoá (kiểm toán 26/10)
  const proposals = listOpenProposals(new Set(live.map((p) => p.key)));
  const skill = captionSkill();
  const measure = roleById("measure")!;
  const measureOk = roleAllows(measure);
  return (
    <>
      <PageHead
        title="Đo lường & cải tiến"
        sub="Kiểm theo skill trước, AI sau. Anh chấp nhận hoặc bỏ qua."
        action={<form action={refreshLearningAction}><Button type="submit" variant="primary" size="md">Phân tích lại</Button></form>}
      />
      <Segment basePath="/insights/learning" active="cai-tien" items={TABS} />

      <Panel>
        <PanelHeader
          title="Đo lường theo thứ tự: skill trước, AI sau"
          sub={`① Kiểm theo skill (luật, không AI): ${skill ? `skill “${skill.title}” (${skill.status})` : "chưa có skill viết content — kiểm theo cấu trúc mặc định"} — đã kiểm ${facts.skillChecked} bài đăng thật. ② ${measure.name}: ${measureOk.ok ? "chạy khi anh bấm (tính vào trần chi phí AI)" : measureOk.reason}.`}
          action={
            <form action={aiReviewAction}>
              <Button type="submit" variant="soft" size="md" disabled={!measureOk.ok || facts.skillChecked === 0}>AI Đo lường đề xuất</Button>
            </form>
          }
        />
      </Panel>

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
                    <span className="text-[13.5px] font-semibold text-ink">{shown(p.title)}</span>
                    <Pill tone={st.tone}>{st.label}</Pill>
                    <span className="text-[11.5px] text-ink-3">giả thuyết · tin cậy {p.confidence} · mẫu {p.sampleSize} · {formatDateTime(p.updatedAt)}</span>
                  </div>
                  <p className="m-0 text-[12.5px] text-ink">{shown(p.detail)}</p>
                  {p.evidence.length > 0 && <ul className="m-0 list-disc pl-5 text-[12px] text-ink-2">{p.evidence.map((e) => <li key={e}>{shown(e)}</li>)}</ul>}
                  {p.note && <div className="text-[12px] text-ink-2">Ghi chú OWNER: {p.note}</div>}
                  {p.status === "proposed" && (
                    <div className="flex gap-1.5">
                      <ConfirmAction action={decideProposalAction} fields={{ id: p.id, decision: "accepted" }} label="Chấp nhận" title="Chấp nhận đề xuất?" message="Ghi nhận quyết định. Hệ thống không tự sửa skill hay kho kiến thức." confirmLabel="Chấp nhận" variant="soft" withNote={{ label: "Ghi chú (tùy chọn)" }} />
                      <ConfirmAction action={decideProposalAction} fields={{ id: p.id, decision: "rejected" }} label="Bỏ qua" title="Bỏ qua đề xuất?" message="Đề xuất giữ trong lịch sử, không dùng." confirmLabel="Bỏ qua" variant="ghost" withNote={{ label: "Lý do (tùy chọn)" }} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {/* Khối "Bản nháp cho hộp chờ duyệt Second Brain" đã ẩn: chỉ thị OWNER 25/10/2026 ẩn Second Brain khỏi giao diện.
          secondBrainDraft() / markExportedAction giữ trong mã (src/lib/learning) cho phiên được cấp quyền dùng. */}
    </>
  );
}
