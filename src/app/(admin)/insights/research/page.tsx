import Link from "next/link";
import { PageHead, Panel, PanelHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { EmptyState } from "@/components/ui/empty-state";
import { inputClass } from "@/components/ui/field";
import { SubmitButton } from "@/components/campaigns/submit-button";
import { createTopicAction } from "@/lib/actions/research";
import { listTopics } from "@/lib/research/topic";
import { formatDateTime } from "@/lib/format";
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
      <PageHead title="Chủ đề & insight" sub={tab === "chu-de" ? "Nhập chủ đề → lấy insight → tạo hook." : undefined} />
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
  const topics = listTopics();
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
        <PanelHeader title="Chủ đề của anh" />
        {topics.length === 0 ? (
          <EmptyState title="Chưa có chủ đề" hint="Nhập chủ đề ở trên để bắt đầu." />
        ) : (
          <ul className="m-0 list-none p-0">
            {topics.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-3 last:border-b-0">
                <Link href={`/insights/research/${t.id}`} className="min-w-0 flex-1 font-semibold text-ink hover:underline">{t.topic}</Link>
                <span className="flex flex-wrap gap-1.5">
                  {Object.entries(t.sources).map(([k, n]) => <Pill key={k} tone="neutral">{k} · {n}</Pill>)}
                  <Pill tone={t.insights ? "jade" : "neutral"}>{t.insights} insight</Pill>
                </span>
                <span className="num text-[12px] text-ink-3">{formatDateTime(t.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
