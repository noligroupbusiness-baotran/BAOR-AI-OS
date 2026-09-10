import { Card, CardHeader, SectionLabel } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Pill } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { ProgressBar } from "@/components/ui/stat";
import { PlatformPill } from "@/components/ui/platform";
import { insights, personas } from "@/lib/data/insights";
import { contentItems } from "@/lib/data/content";

export const metadata = { title: "Insight khách hàng – BAOR AI OS" };

// Hàng trong cây: nhãn loại bên phải, cụm nút hành động bên dưới (giống dashboard tham khảo).
function TreeRow({
  emoji,
  text,
  tag,
  tagTone,
  actions,
  bold,
}: {
  emoji: string;
  text: string;
  tag: string;
  tagTone: "green" | "blue" | "purple" | "gold" | "red";
  actions: React.ReactNode;
  bold?: boolean;
}) {
  return (
    <div className="py-1.5">
      <div className="flex items-start gap-2">
        <span className="mt-[1px] text-[13px]" aria-hidden>
          {emoji}
        </span>
        <div className={bold ? "text-[13.5px] font-bold text-ink" : "text-[13px] font-medium text-ink"}>
          {text}
        </div>
        <Pill tone={tagTone} size="xs" className="ml-1 mt-[2px]">
          {tag}
        </Pill>
      </div>
      <div className="mt-1 flex flex-wrap gap-1 pl-6">{actions}</div>
    </div>
  );
}

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab = "map" } = await searchParams;
  const totalTopics = contentItems.length;

  return (
    <>
      <PageHeader
        emoji="🧠"
        title="Insight khách hàng"
        subtitle="Bước 2. AI đọc bình luận, inbox, CRM và số liệu để rút ra chân dung khách hàng, nỗi đau và insight. Mỗi insight có thể bung thành nhiều chủ đề nội dung."
        meta={
          <>
            <span>👥 {personas.length} nhóm KH</span>
            <span>·</span>
            <span>🧩 {personas.reduce((n, p) => n + p.painPoints.length, 0)} vấn đề</span>
            <span>·</span>
            <span>💡 {insights.length} insight</span>
            <span>·</span>
            <span>🎯 {totalTopics} chủ đề → ước 40 bài có thể làm</span>
          </>
        }
        actions={
          <>
            <Button variant="primary">🤖 AI cập nhật insight</Button>
            <Button>+ Thêm nhóm KH</Button>
          </>
        }
      />

      <FilterTabs
        basePath="/insights"
        active={tab}
        tabs={[
          { key: "map", label: "Bản đồ insight", emoji: "🗺️" },
          { key: "personas", label: "Chân dung khách hàng", emoji: "👥", count: personas.length },
          { key: "list", label: "Kho insight", emoji: "📚", count: insights.length },
        ]}
      />

      {tab === "map" && (
        <div className="mt-4 space-y-4">
          {personas.map((p) => {
            const pInsights = insights.filter((i) => i.personaId === p.id);
            return (
              <Card key={p.id}>
                <TreeRow
                  emoji="👥"
                  text={p.name}
                  tag="Nhóm KH"
                  tagTone="green"
                  bold
                  actions={
                    <>
                      <Button size="xs" variant="soft">🤖 AI sinh Vấn đề</Button>
                      <Button size="xs">+ tự thêm</Button>
                      <Button size="xs" variant="danger">🗑</Button>
                    </>
                  }
                />
                <div className="tree-branch" data-tone="green">
                  {p.painPoints.map((pain, painIdx) => {
                    // Ghép mỗi vấn đề với một insight của nhóm KH đó (dữ liệu mẫu), không lặp.
                    const ins = painIdx < pInsights.length ? pInsights[painIdx] : undefined;
                    const topics = ins ? contentItems.filter((c) => c.insightId === ins.id) : [];
                    return (
                      <div key={pain}>
                        <TreeRow
                          emoji="🧩"
                          text={pain}
                          tag="Vấn đề"
                          tagTone="blue"
                          actions={
                            <>
                              <Button size="xs" variant="soft">🤖 AI sinh Insight</Button>
                              <Button size="xs">+ tự thêm</Button>
                              <Button size="xs" variant="danger">🗑</Button>
                            </>
                          }
                        />
                        <div className="tree-branch" data-tone="blue">
                          {!ins && (
                            <div className="py-1 text-[12px] text-faint">
                              Chưa có insight cho vấn đề này. Bấm “AI sinh Insight” để phân tích.
                            </div>
                          )}
                          {ins && (
                            <div>
                              <TreeRow
                                emoji="💡"
                                text={ins.title + " — " + ins.detail.split(".")[0] + "."}
                                tag="Insight"
                                tagTone="purple"
                                actions={
                                  <>
                                    <Button size="xs" variant="soft">🤖 AI sinh Chủ đề</Button>
                                    <Button size="xs">+ tự thêm</Button>
                                    <Button size="xs" variant="primary">✨ Bung 10 góc</Button>
                                    <Pill tone="neutral" size="xs" className="self-center">
                                      tin cậy {ins.confidence}%
                                    </Pill>
                                    <Button size="xs" variant="danger">🗑</Button>
                                  </>
                                }
                              />
                              <div className="tree-branch" data-tone="purple">
                                {topics.map((t) => (
                                  <TreeRow
                                    key={t.id}
                                    emoji="🎯"
                                    text={t.title}
                                    tag="Chủ đề"
                                    tagTone="gold"
                                    actions={
                                      <>
                                        <Button size="xs" variant="soft">✨ Bung 10 góc</Button>
                                        <Button size="xs" variant="ghost">✓ đã có bài</Button>
                                      </>
                                    }
                                  />
                                ))}
                                {topics.length === 0 && (
                                  <div className="py-1 text-[12px] text-faint">
                                    Chưa có chủ đề. Bấm “Bung 10 góc” để AI đề xuất.
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {tab === "personas" && (
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {personas.map((p) => (
            <Card key={p.id}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[14px] font-bold text-ink">{p.name}</div>
                  <div className="text-[11.5px] text-muted">
                    {p.ageRange} tuổi · {p.occupation} · {p.location}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[18px] font-bold tabular-nums text-primary-text">{p.share}%</div>
                  <div className="text-[10.5px] text-faint">tập khách</div>
                </div>
              </div>
              <ProgressBar value={p.share} className="mt-2" />
              <div className="mt-3 space-y-2.5 text-[12.5px]">
                <div>
                  <SectionLabel tone="green">🎯 Mong muốn</SectionLabel>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-ink">
                    {p.goals.map((g) => (
                      <li key={g}>{g}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <SectionLabel tone="red">🩹 Nỗi đau</SectionLabel>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-ink">
                    {p.painPoints.map((g) => (
                      <li key={g}>{g}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <SectionLabel tone="gold">🚧 Rào cản mua</SectionLabel>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-ink">
                    {p.objections.map((g) => (
                      <li key={g}>{g}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <SectionLabel>📍 Kênh</SectionLabel>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {p.channels.map((c) => (
                      <PlatformPill key={c} platform={c} />
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === "list" && (
        <Card className="mt-4">
          <CardHeader
            icon="📚"
            title="Kho insight"
            subtitle="Xếp theo độ tin cậy. Insight chưa dùng sẽ được ưu tiên đề xuất nội dung."
          />
          <ul className="divide-y divide-border/70">
            {insights
              .slice()
              .sort((a, b) => b.confidence - a.confidence)
              .map((i, idx) => {
                const persona = personas.find((p) => p.id === i.personaId);
                return (
                  <li key={i.id} className="flex items-start gap-3 py-3">
                    <span className="w-5 pt-0.5 text-[12px] font-bold tabular-nums text-faint">{idx + 1}.</span>
                    <Pill tone={i.confidence >= 85 ? "green" : "gold"} className="tabular-nums">
                      ★ {i.confidence}
                    </Pill>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-semibold text-ink">{i.title}</div>
                      <p className="mt-0.5 text-[12.5px] text-muted">{i.detail}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-faint">
                        <Pill tone="green" size="xs">
                          👥 {persona?.name}
                        </Pill>
                        <span>· Nguồn: {i.source}</span>
                        <span>· Đã dùng cho {i.usedInContent} bài</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button size="xs" variant="primary">✨ Bung 10 góc</Button>
                      <Button size="xs" variant="ghost">Sửa</Button>
                    </div>
                  </li>
                );
              })}
          </ul>
        </Card>
      )}
    </>
  );
}
