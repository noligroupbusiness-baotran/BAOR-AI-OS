import { Card, CardHeader, SectionLabel } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Pill } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { ProgressBar } from "@/components/ui/stat";
import { Table, Th, Td } from "@/components/ui/table";
import { PlatformPill, platformMeta } from "@/components/ui/platform";
import { competitors, platformResearch } from "@/lib/data/research";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Research nền tảng – BAOR AI OS" };

export default async function ResearchPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab = "platforms" } = await searchParams;

  return (
    <>
      <PageHeader
        emoji="🔭"
        title="Research nền tảng"
        subtitle="Bước 1. AI quét xu hướng, định dạng nội dung đang lên và đối thủ trên từng nền tảng, rồi chấm mức phù hợp với khách hàng mục tiêu của bạn."
        meta={
          <>
            <span>Cập nhật lần cuối: {formatDateTime(platformResearch[0].updatedAt)}</span>
            <span>·</span>
            <span>Lịch: Thứ 2 hằng tuần, 06:00</span>
          </>
        }
        actions={
          <>
            <Button variant="primary">🤖 Chạy research mới</Button>
            <Button>📄 Xuất báo cáo</Button>
          </>
        }
      />

      <FilterTabs
        basePath="/research"
        active={tab}
        tabs={[
          { key: "platforms", label: "Nền tảng & xu hướng", emoji: "🌐", count: platformResearch.length },
          { key: "competitors", label: "Đối thủ", emoji: "🥊", count: competitors.length },
        ]}
      />

      {tab === "platforms" ? (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {platformResearch
            .slice()
            .sort((a, b) => b.audienceFit - a.audienceFit)
            .map((r, i) => {
              const m = platformMeta(r.platform);
              return (
                <Card key={r.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[20px]" aria-hidden>
                        {m.emoji}
                      </span>
                      <div>
                        <div className="text-[14px] font-bold text-ink">
                          {r.name}
                          {i === 0 && (
                            <Pill tone="green" size="xs" className="ml-2">
                              Kênh chính
                            </Pill>
                          )}
                        </div>
                        <div className="text-[11px] text-faint">Cập nhật {formatDateTime(r.updatedAt)}</div>
                      </div>
                    </div>
                    <div className="w-[120px] text-right">
                      <div className="eyebrow">Phù hợp khách</div>
                      <div className="text-[18px] font-bold tabular-nums text-ink">{r.audienceFit}%</div>
                      <ProgressBar
                        value={r.audienceFit}
                        tone={r.audienceFit >= 80 ? "green" : r.audienceFit >= 65 ? "gold" : "blue"}
                        className="mt-1"
                      />
                    </div>
                  </div>
                  <p className="mt-3 text-[12.5px] leading-relaxed text-ink">{r.summary}</p>
                  <div className="mt-3 space-y-2">
                    <div>
                      <SectionLabel>🔥 Chủ đề đang lên</SectionLabel>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {r.trendingTopics.map((t) => (
                          <Pill key={t} tone="orange">
                            {t}
                          </Pill>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <SectionLabel>🎞️ Định dạng</SectionLabel>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {r.contentFormats.map((t) => (
                            <Pill key={t} tone="blue" size="xs">
                              {t}
                            </Pill>
                          ))}
                        </div>
                      </div>
                      <div>
                        <SectionLabel>⏰ Giờ vàng</SectionLabel>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {r.bestPostingTimes.map((t) => (
                            <Pill key={t} tone="teal" size="xs" className="tabular-nums">
                              {t}
                            </Pill>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-1.5 border-t border-border pt-3">
                    <Button size="xs" variant="soft">💡 Sinh ý tưởng từ nền tảng này</Button>
                    <Button size="xs" variant="ghost">Chi tiết</Button>
                  </div>
                </Card>
              );
            })}
        </div>
      ) : (
        <Card className="mt-4">
          <CardHeader
            icon="🥊"
            title="Đối thủ đang theo dõi"
            subtitle="AI theo dõi tần suất đăng, tương tác và điểm mạnh để bạn học nhanh hơn."
            action={<Button size="xs">+ Thêm đối thủ</Button>}
          />
          <Table>
            <thead>
              <tr>
                <Th>Đối thủ</Th>
                <Th>Nền tảng</Th>
                <Th className="text-right">Người theo dõi</Th>
                <Th className="text-right">Bài / tuần</Th>
                <Th className="text-right">Tương tác TB</Th>
                <Th>Điểm mạnh</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {competitors.map((c) => (
                <tr key={c.id} className="hover:bg-bg-elevated">
                  <Td className="font-medium text-ink">{c.name}</Td>
                  <Td>
                    <PlatformPill platform={c.platform} />
                  </Td>
                  <Td className="text-right tabular-nums">{c.followers}</Td>
                  <Td className="text-right tabular-nums">{c.postsPerWeek}</Td>
                  <Td className="text-right tabular-nums">{c.avgEngagement}</Td>
                  <Td className="text-muted">{c.strengths}</Td>
                  <Td className="text-right">
                    <Button size="xs" variant="ghost">
                      Phân tích bài tốt nhất
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </>
  );
}
