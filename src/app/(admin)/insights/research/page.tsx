import Link from "next/link";
import { PageHead, Panel, PanelHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { EmptyState } from "@/components/ui/empty-state";
import { inputClass } from "@/components/ui/field";
import { SubmitButton } from "@/components/campaigns/submit-button";
import { createTopicAction } from "@/lib/actions/research";
import { topicBoard } from "@/lib/content/priority";
import { aiReadiness } from "@/lib/ai";
import { formatDateTime } from "@/lib/format";
import { FlowSteps, NextStep } from "@/components/research/topic-flow";
import { ScoreTip, TopPick } from "@/components/ui/score-tip";
import { Segment } from "@/components/ui/segment";
import { CustomerInsightsView } from "@/components/insights/customer-insights-view";

export const metadata = { title: "Chủ đề & insight – BAOR AI OS" };

const TABS = [
  { key: "chu-de", label: "Chủ đề" },
  { key: "insight", label: "Insight" },
];

// Nghiên cứu, bản đơn giản (OWNER 25/10/2026, theo sơ đồ Personal Brand System): 1. anh đề xuất chủ đề → 2. lấy insight từ nền tảng
// (nhóm Facebook, bình luận YouTube, bình luận Facebook, kiến thức trên social) → 3. tạo 10 hook từ insight.
// Hai tab (OWNER 26/10/2026): "Chủ đề" (mặc định) | "Insight" (nội dung trang /insights cũ: chân dung, nỗi đau, đối thủ, xu hướng).
export default async function ResearchPage({ searchParams }: { searchParams: Promise<{ topic?: string; tab?: string; campaign?: string; goal?: string; link?: string; add?: string; competitor?: string }> }) {
  const sp = await searchParams;
  const tab = sp.tab === "insight" ? "insight" : "chu-de";
  const head = (
    <>
      <PageHead title="Chủ đề & insight" sub={tab === "chu-de" ? "Chủ đề → insight → hook → kịch bản." : undefined} />
      <Segment basePath="/insights/research" active={tab} items={TABS} />
    </>
  );
  if (tab === "insight") {
    return (
      <>
        {head}
        <CustomerInsightsView sp={sp} />
      </>
    );
  }
  const topics = topicBoard();
  const ai = aiReadiness("ideas");
  return (
    <>
      {head}

      <Panel>
        <form action={createTopicAction} className="grid gap-2 p-4 md:grid-cols-[1fr_auto] md:items-end">
          <label className="block">
            <span className="lbl">Chủ đề marketing anh muốn làm</span>
            <input name="topic" required minLength={4} defaultValue={sp.topic ?? ""} placeholder="vd: chào hỏi phá băng khi gọi điện cho khách mới" className={`${inputClass} mt-1`} />
          </label>
          <SubmitButton pendingText="Đang tạo…">Bắt đầu</SubmitButton>
        </form>
      </Panel>

      <Panel>
        <PanelHeader title="Chủ đề của anh" sub={topics.length ? "Xếp theo điểm ưu tiên" : undefined} />
        {topics.length === 0 ? (
          <EmptyState title="Chưa có chủ đề" hint="Nhập chủ đề ở trên để bắt đầu." />
        ) : (
          <ul className="m-0 list-none p-0" data-testid="topic-list">
            {topics.map((t) => (
              <li key={t.id} data-topic={t.id} className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 border-b border-border px-4 py-3 last:border-b-0 md:grid-cols-[auto_minmax(0,1fr)_auto]">
                <ScoreTip score={t.score} reasons={t.reasons} kind="chủ đề" />
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <Link href={`/insights/research/${t.id}`} className="min-w-0 truncate font-semibold text-ink hover:underline" title={t.topic}>{t.topic}</Link>
                    {t.top && <TopPick />}
                    {t.dup && <span title="Trùng tên với chủ đề khác"><Pill tone="amber">trùng</Pill></span>}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <FlowSteps counts={t.counts} />
                    <span className="num text-[11.5px] text-ink-3" title={Object.entries(t.sources).map(([k, n]) => `${k}: ${n}`).join(" · ") || undefined}>{formatDateTime(t.createdAt)}</span>
                  </div>
                </div>
                <div className="col-span-2 flex justify-end md:col-span-1">
                  <NextStep id={t.id} topic={t.topic} step={t.step} aiReady={ai.ok} aiReason={ai.ok ? undefined : ai.reason} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
