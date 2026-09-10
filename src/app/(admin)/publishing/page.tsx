import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Pill, Dot } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { StatTile } from "@/components/ui/stat";
import { Table, Th, Td } from "@/components/ui/table";
import { PlatformPill } from "@/components/ui/platform";
import { scheduledPosts } from "@/lib/data/content";
import { postStatusLabel } from "@/lib/labels";
import { formatDateTime, formatNumber, formatTime, dateKey, cn } from "@/lib/format";

export const metadata = { title: "Lịch đăng – BAOR AI OS" };

const weekDays = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
// Tuần 07/09 – 13/09/2026 (Thứ 2 là 07/09)
const weekStart = new Date("2026-09-07T00:00:00+07:00");

export default async function PublishingPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab = "calendar" } = await searchParams;
  const published = scheduledPosts.filter((p) => p.status === "published");
  const failed = scheduledPosts.filter((p) => p.status === "failed");
  const queue = scheduledPosts
    .filter((p) => p.status === "scheduled")
    .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));

  return (
    <>
      <PageHeader
        emoji="📅"
        title="Tự động đăng bài"
        subtitle="Bước 5. Nội dung đã duyệt được xếp vào giờ vàng của từng nền tảng và tự đăng. Sau khi đăng, hệ thống theo dõi reach/tương tác để quyết định có đẩy ads hay không."
        meta={
          <>
            <span className="flex items-center gap-1.5">
              <Dot tone="green" live /> Scheduler đang chạy
            </span>
            <span>·</span>
            <span>Múi giờ: Asia/Ho_Chi_Minh</span>
            {failed.length > 0 && (
              <>
                <span>·</span>
                <span className="font-medium text-red">⚠ {failed.length} bài đăng lỗi</span>
              </>
            )}
          </>
        }
        actions={
          <>
            <Button variant="primary">🤖 Xếp lịch tự động tuần sau</Button>
            <Button>+ Lên lịch thủ công</Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Chờ đăng" value={String(queue.length)} hint="tuần này" />
        <StatTile label="Đã đăng (7 ngày)" value={String(published.length)} delta={14.3} />
        <StatTile
          label="Reach trung bình / bài"
          value={formatNumber(Math.round(published.reduce((n, p) => n + (p.reach ?? 0), 0) / published.length))}
          delta={9.8}
        />
        <StatTile label="Lỗi đăng" value={String(failed.length)} hint="Token hết hạn" />
      </div>

      <div className="mt-4">
        <FilterTabs
          basePath="/publishing"
          active={tab}
          tabs={[
            { key: "calendar", label: "Lịch tuần", emoji: "🗓️" },
            { key: "queue", label: "Hàng đợi", emoji: "⏳", count: queue.length },
            { key: "results", label: "Kết quả", emoji: "📈", count: published.length },
          ]}
        />
      </div>

      {tab === "calendar" && (
        <Card className="mt-4" padded={false}>
          <div className="grid grid-cols-7 divide-x divide-border">
            {weekDays.map((d, i) => {
              const day = new Date(weekStart.getTime() + i * 86400000);
              const key = dateKey(day);
              const dayPosts = scheduledPosts.filter((p) => dateKey(p.scheduledFor) === key);
              const isToday = i === 3;
              return (
                <div key={d} className={cn("min-h-[220px]", isToday && "bg-primary-soft/30")}>
                  <div className="flex items-center justify-between border-b border-border px-2.5 py-2">
                    <span className={cn("text-[11px] font-bold", isToday ? "text-primary-text" : "text-faint")}>
                      {d}
                    </span>
                    <span className={cn("text-[12px] font-semibold tabular-nums", isToday ? "text-primary-text" : "text-ink")}>
                      {key.slice(8, 10)}/{key.slice(5, 7)}
                    </span>
                  </div>
                  <div className="space-y-1.5 p-1.5">
                    {dayPosts.map((p) => {
                      const st = postStatusLabel[p.status];
                      return (
                        <div
                          key={p.id}
                          className={cn(
                            "rounded-md border px-2 py-1.5 text-[11px]",
                            p.status === "failed"
                              ? "border-red/30 bg-red-soft"
                              : p.status === "published"
                                ? "border-primary/20 bg-primary-soft/60"
                                : "border-border bg-surface",
                          )}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-semibold tabular-nums text-ink">{formatTime(p.scheduledFor)}</span>
                            <PlatformPill platform={p.platform} short />
                          </div>
                          <div className="mt-0.5 line-clamp-2 text-ink">{p.title}</div>
                          <Pill tone={st.tone} size="xs" className="mt-1">
                            {st.label}
                          </Pill>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {tab === "queue" && (
        <Card className="mt-4">
          <CardHeader icon="⏳" title="Hàng đợi đăng" subtitle="Bài sẽ tự đăng đúng giờ. Kéo thả để đổi thứ tự (sắp có)." />
          <Table>
            <thead>
              <tr>
                <Th>Giờ đăng</Th>
                <Th>Nội dung</Th>
                <Th>Nền tảng</Th>
                <Th>Trạng thái</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {[...queue, ...failed].map((p) => {
                const st = postStatusLabel[p.status];
                return (
                  <tr key={p.id} className="hover:bg-bg-elevated">
                    <Td className="tabular-nums font-medium text-ink">{formatDateTime(p.scheduledFor)}</Td>
                    <Td>
                      <div className="text-ink">{p.title}</div>
                      {p.error && <div className="text-[11.5px] text-red">⚠ {p.error}</div>}
                    </Td>
                    <Td><PlatformPill platform={p.platform} /></Td>
                    <Td><Pill tone={st.tone}>{st.label}</Pill></Td>
                    <Td className="text-right">
                      {p.status === "failed" ? (
                        <Button size="xs" variant="primary">Đăng lại</Button>
                      ) : (
                        <Button size="xs" variant="ghost">Đổi giờ</Button>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}

      {tab === "results" && (
        <Card className="mt-4">
          <CardHeader
            icon="📈"
            title="Kết quả bài đã đăng"
            subtitle="Bài vượt 3% tương tác sẽ được AI đề xuất chạy quảng cáo."
          />
          <Table>
            <thead>
              <tr>
                <Th>Đăng lúc</Th>
                <Th>Nội dung</Th>
                <Th>Nền tảng</Th>
                <Th className="text-right">Reach</Th>
                <Th className="text-right">Tương tác</Th>
                <Th className="text-right">Tỷ lệ</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {published
                .slice()
                .sort((a, b) => (b.engagement ?? 0) - (a.engagement ?? 0))
                .map((p) => {
                  const rate = ((p.engagement ?? 0) / (p.reach ?? 1)) * 100;
                  return (
                    <tr key={p.id} className="hover:bg-bg-elevated">
                      <Td className="tabular-nums text-muted">{formatDateTime(p.scheduledFor)}</Td>
                      <Td className="font-medium text-ink">{p.title}</Td>
                      <Td><PlatformPill platform={p.platform} /></Td>
                      <Td className="text-right tabular-nums">{formatNumber(p.reach ?? 0)}</Td>
                      <Td className="text-right tabular-nums">{formatNumber(p.engagement ?? 0)}</Td>
                      <Td className="text-right">
                        <Pill tone={rate >= 4 ? "green" : rate >= 3 ? "gold" : "neutral"} className="tabular-nums">
                          {rate.toFixed(1)}%
                        </Pill>
                      </Td>
                      <Td className="text-right">
                        {rate >= 3 ? (
                          <Button size="xs" variant="soft">📣 Đẩy ads</Button>
                        ) : (
                          <Button size="xs" variant="ghost">Chi tiết</Button>
                        )}
                      </Td>
                    </tr>
                  );
                })}
            </tbody>
          </Table>
        </Card>
      )}
    </>
  );
}
