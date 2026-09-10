import { PageHead, Panel, PanelHeader, Rows, Row } from "@/components/ui/card";
import { Pill, Score } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { Segment } from "@/components/ui/segment";
import { contentItems } from "@/lib/data/content";
import { insights } from "@/lib/data/insights";
import { contentFormatLabel, contentStatusLabel } from "@/lib/labels";
import { formatDateTime } from "@/lib/format";
import type { ContentStatus } from "@/lib/types";

export const metadata = { title: "Nội dung – BAOR AI OS" };

export default async function ContentPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = "proposed" } = await searchParams;
  const count = (s: ContentStatus[]) => contentItems.filter((c) => s.includes(c.status)).length;
  const groups: Record<string, ContentStatus[]> = {
    proposed: ["proposed"],
    mine: ["in_progress", "review"],
    done: ["approved", "scheduled", "published"],
  };
  const statuses = groups[tab] ?? groups.proposed;
  const list = contentItems.filter((c) => statuses.includes(c.status)).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  return (
    <>
      <PageHead
        title="Nội dung"
        sub="AI đề xuất và viết nháp, bạn là người hoàn thiện. Chỉ bài bạn đã duyệt mới được tự đăng."
        action={<Button variant="primary" size="md">Tạo 10 ý tưởng mới</Button>}
      />

      <Segment
        basePath="/content"
        active={tab}
        items={[
          { key: "proposed", label: `AI đề xuất · ${count(groups.proposed)}` },
          { key: "mine", label: `Bạn đang làm · ${count(groups.mine)}` },
          { key: "done", label: `Đã duyệt · ${count(groups.done)}` },
        ]}
      />

      <Panel>
        <PanelHeader
          title={tab === "proposed" ? "Đáng làm nhất hôm nay" : tab === "mine" ? "Bàn làm việc của bạn" : "Đã duyệt và đã đăng"}
          sub={tab === "proposed" ? "Xếp theo tín hiệu thật từ khách." : undefined}
        />
        <Rows>
          {list.map((c, idx) => {
            const ins = insights.find((i) => i.id === c.insightId);
            const st = contentStatusLabel[c.status];
            return (
              <Row
                key={c.id}
                lead={
                  <span className="flex items-center gap-3">
                    <span className="w-3 text-[12px] font-semibold text-ink-3">{idx + 1}</span>
                    <Score value={c.score ?? 0} />
                  </span>
                }
                title={c.title}
                sub={c.hook}
                extra={
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {tab !== "proposed" && <Pill tone={st.tone}>{st.label}</Pill>}
                    <Pill tone="sky">{contentFormatLabel[c.format]}</Pill>
                    <Pill tone="violet">{c.pillar}</Pill>
                    {ins && <Pill>{ins.title}</Pill>}
                    {c.scheduledFor && <Pill className="num">{formatDateTime(c.scheduledFor)}</Pill>}
                  </div>
                }
                action={
                  c.status === "proposed" ? (
                    <Button variant="soft">Nhận làm</Button>
                  ) : c.status === "in_progress" ? (
                    <Button variant="primary">Gửi duyệt</Button>
                  ) : c.status === "review" ? (
                    <Button variant="primary">Duyệt</Button>
                  ) : (
                    <Button variant="ghost">Mở</Button>
                  )
                }
              />
            );
          })}
        </Rows>
      </Panel>

      {tab === "proposed" && (
        <p className="mt-3.5 rounded-[var(--radius)] bg-violet-soft px-3.5 py-2.5 text-[12.5px] text-ink">
          <b className="text-violet">AI đề xuất</b> chỉ là gợi ý. Bạn có thể bỏ qua, sửa hook, hoặc để AI viết nháp rồi bạn quay/chụp và duyệt.
        </p>
      )}
    </>
  );
}
