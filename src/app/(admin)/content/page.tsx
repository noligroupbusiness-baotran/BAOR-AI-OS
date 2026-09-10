import { Card, CardHeader, SectionLabel } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Pill, ScoreBadge } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { EmptyState } from "@/components/ui/empty";
import { contentItems } from "@/lib/data/content";
import { insights } from "@/lib/data/insights";
import { contentFormatLabel, contentStatusLabel } from "@/lib/labels";
import { formatDateTime, cn } from "@/lib/format";
import type { ContentStatus } from "@/lib/types";

export const metadata = { title: "Nội dung – BAOR AI OS" };

const statusOrder: ContentStatus[] = ["proposed", "in_progress", "review", "approved", "scheduled", "published"];

function StageStrip({ status }: { status: ContentStatus }) {
  const idx = statusOrder.indexOf(status);
  return (
    <div className="flex flex-wrap items-center gap-1">
      {statusOrder.map((s, i) => {
        const m = contentStatusLabel[s];
        const reached = i <= idx;
        return (
          <span
            key={s}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-1.5 py-[1px] text-[10.5px]",
              reached ? "border-primary/30 bg-primary-soft text-primary-text" : "border-border text-faint",
            )}
          >
            {reached ? "✓" : m.emoji} {m.label}
          </span>
        );
      })}
    </div>
  );
}

export default async function ContentPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab = "proposed" } = await searchParams;
  const count = (s: ContentStatus) => contentItems.filter((c) => c.status === s).length;
  const list =
    tab === "all"
      ? contentItems
      : tab === "done"
        ? contentItems.filter((c) => ["approved", "scheduled", "published"].includes(c.status))
        : contentItems.filter((c) => c.status === tab);

  const sorted = list.slice().sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  return (
    <>
      <PageHeader
        emoji="💡"
        title={tab === "in_progress" ? "Bàn làm việc của bạn" : "Ý tưởng nên làm hôm nay"}
        subtitle="Bước 3–4. AI đề xuất ý tưởng và viết nháp bám theo insight; bạn là người hoàn thiện và duyệt. Chỉ nội dung đã duyệt mới được tự động đăng."
        meta={
          <>
            <span>Từ {insights.length} insight · xếp theo tín hiệu thật từ khách</span>
            <span>·</span>
            <span>AI đề xuất mỗi sáng 07:00</span>
          </>
        }
        actions={
          <>
            <Button variant="primary">🤖 Tạo 10 ý tưởng mới</Button>
            <Button>📅 Kế hoạch tuần</Button>
            <Button>+ Viết bài mới</Button>
          </>
        }
      />

      <FilterTabs
        basePath="/content"
        active={tab}
        tabs={[
          { key: "proposed", label: "AI đề xuất", emoji: "💡", count: count("proposed") },
          { key: "in_progress", label: "Bạn đang làm", emoji: "✍️", count: count("in_progress") },
          { key: "review", label: "Chờ duyệt", emoji: "👀", count: count("review") },
          { key: "done", label: "Đã duyệt / đã đăng", emoji: "✅", count: count("approved") + count("scheduled") + count("published") },
          { key: "all", label: "Tất cả", count: contentItems.length },
        ]}
      />

      {tab === "proposed" && (
        <div className="mt-4 rounded-[var(--radius)] border border-border bg-surface">
          <div className="border-b border-border px-4 py-2.5">
            <SectionLabel tone="red">🎯 Top ý tưởng đáng làm nhất — xếp theo tín hiệu thật từ khách · nhận xong bấm ✓</SectionLabel>
          </div>
          <ol className="divide-y divide-border/70">
            {sorted.map((c, i) => {
              const ins = insights.find((x) => x.id === c.insightId);
              const f = contentFormatLabel[c.format];
              return (
                <li key={c.id} id={c.id} className="px-4 py-3 hover:bg-bg-elevated">
                  <div className="flex items-start gap-3">
                    <span className="w-5 pt-0.5 text-[12px] font-bold tabular-nums text-faint">{i + 1}.</span>
                    <ScoreBadge score={c.score ?? 0} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] font-semibold text-ink">
                        {c.title}
                        <span className="ml-2 text-[11.5px] font-normal text-muted">
                          — {c.hook}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Pill tone="blue" size="xs">{f.emoji} {f.label}</Pill>
                        <Pill tone="gold" size="xs">🏛 {c.pillar}</Pill>
                        {ins && <Pill tone="purple" size="xs">💡 {ins.title}</Pill>}
                      </div>
                      <div className="mt-2 rounded-md bg-surface-soft px-3 py-2 text-[12px] text-ink">
                        <b>Dàn ý:</b>{" "}
                        {c.outline.map((o, k) => (
                          <span key={o}>
                            {k + 1}. {o}
                            {k < c.outline.length - 1 ? " · " : ""}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col gap-1">
                      <Button size="xs" variant="primary">✍️ Tôi nhận làm</Button>
                      <Button size="xs" variant="soft">🤖 AI viết nháp</Button>
                      <Button size="xs" variant="ghost">Bỏ qua</Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {tab !== "proposed" && (
        <div className="mt-4 space-y-3">
          {sorted.length === 0 && (
            <EmptyState title="Chưa có nội dung ở trạng thái này" hint="Nhận một ý tưởng từ tab AI đề xuất để bắt đầu." />
          )}
          {sorted.map((c) => {
            const f = contentFormatLabel[c.format];
            const st = contentStatusLabel[c.status];
            const ins = insights.find((x) => x.id === c.insightId);
            return (
              <Card key={c.id} id={c.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <ScoreBadge score={c.score ?? 0} />
                      <h3 className="text-[14px] font-bold text-ink">{c.title}</h3>
                      <Pill tone={st.tone} size="xs">{st.emoji} {st.label}</Pill>
                      <Pill tone="blue" size="xs">{f.emoji} {f.label}</Pill>
                    </div>
                    <p className="mt-1 text-[12.5px] text-muted">Hook: “{c.hook}”</p>
                    <div className="mt-2">
                      <StageStrip status={c.status} />
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    {c.status === "in_progress" && (
                      <>
                        <Button size="xs" variant="primary">✅ Gửi duyệt</Button>
                        <Button size="xs" variant="soft">🤖 AI gợi ý sửa</Button>
                      </>
                    )}
                    {c.status === "review" && <Button size="xs" variant="primary">✅ Duyệt</Button>}
                    {c.status === "approved" && <Button size="xs" variant="primary">📅 Lên lịch</Button>}
                    {(c.status === "scheduled" || c.status === "published") && (
                      <Button size="xs">📈 Xem kết quả</Button>
                    )}
                    <Button size="xs" variant="ghost">✏️ Mở</Button>
                  </div>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <div className="md:col-span-2 rounded-md border border-border bg-bg-elevated p-3">
                    <SectionLabel>📝 Bản nháp</SectionLabel>
                    <p className="mt-1 whitespace-pre-line text-[12.5px] leading-relaxed text-ink">
                      {c.draft ?? "Chưa có bản nháp. Bấm “AI viết nháp” hoặc tự viết."}
                    </p>
                  </div>
                  <div className="space-y-2 text-[12px]">
                    <div>
                      <SectionLabel>🧭 Dàn ý</SectionLabel>
                      <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-ink">
                        {c.outline.map((o) => (
                          <li key={o}>{o}</li>
                        ))}
                      </ol>
                    </div>
                    {ins && (
                      <div>
                        <SectionLabel tone="purple">💡 Insight gốc</SectionLabel>
                        <div className="mt-1 text-ink">{ins.title}</div>
                      </div>
                    )}
                    {c.scheduledFor && (
                      <div>
                        <SectionLabel tone="blue">📅 Lịch</SectionLabel>
                        <div className="mt-1 tabular-nums text-ink">{formatDateTime(c.scheduledFor)}</div>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Card className="mt-4">
        <CardHeader icon="🧭" title="Trụ cột nội dung" subtitle="Tỷ lệ AI khuyến nghị cho tuần này để cân bằng niềm tin, giáo dục và bán hàng." />
        <div className="grid gap-2 sm:grid-cols-5">
          {[
            ["Niềm tin", 30, "green"],
            ["Giáo dục", 25, "blue"],
            ["Bằng chứng", 20, "purple"],
            ["Kết nối", 15, "gold"],
            ["Dịch vụ / bán", 10, "orange"],
          ].map(([name, pct, tone]) => (
            <div key={name as string} className="rounded-md border border-border bg-bg-elevated px-3 py-2">
              <div className="flex items-center justify-between">
                <span className="text-[12.5px] font-semibold text-ink">{name}</span>
                <Pill tone={tone as "green"} size="xs" className="tabular-nums">{pct}%</Pill>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
