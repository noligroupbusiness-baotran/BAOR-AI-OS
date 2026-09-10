import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Pill, Dot } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { StatTile, ProgressBar } from "@/components/ui/stat";
import { Table, Th, Td } from "@/components/ui/table";
import { Toggle } from "@/components/ui/toggle";
import { emailCampaigns, emailSequences, emailStats } from "@/lib/data/email";
import { formatDateTime, formatNumber } from "@/lib/format";

export const metadata = { title: "Email marketing – BAOR AI OS" };

export default async function EmailPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab = "sequences" } = await searchParams;

  return (
    <>
      <PageHeader
        emoji="✉️"
        title="Email marketing"
        subtitle="Bước 8. Lead có email được đưa vào chuỗi tự động theo giai đoạn. AI soạn chiến dịch từ nội dung đã đăng tốt, bạn duyệt trước khi gửi hàng loạt."
        meta={
          <>
            <span className="flex items-center gap-1.5">
              <Dot tone="green" live /> {emailSequences.filter((s) => s.active).length} chuỗi đang chạy
            </span>
            <span>·</span>
            <span>{formatNumber(emailStats.subscribers)} người đăng ký</span>
          </>
        }
        actions={
          <>
            <Button variant="primary">🤖 AI soạn chiến dịch</Button>
            <Button>+ Chuỗi mới</Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatTile label="Người đăng ký" value={formatNumber(emailStats.subscribers)} delta={3.8} />
        <StatTile label="Mới tuần này" value={String(emailStats.newThisWeek)} delta={12.1} />
        <StatTile label="Tỷ lệ mở TB" value={`${emailStats.avgOpenRate}%`} delta={3.4} />
        <StatTile label="Tỷ lệ click TB" value={`${emailStats.avgClickRate}%`} delta={1.2} />
        <StatTile label="Hủy đăng ký" value={`${emailStats.unsubscribeRate}%`} delta={-0.1} hint="thấp là tốt" />
      </div>

      <div className="mt-4">
        <FilterTabs
          basePath="/email"
          active={tab}
          tabs={[
            { key: "sequences", label: "Chuỗi tự động", emoji: "🔁", count: emailSequences.length },
            { key: "campaigns", label: "Chiến dịch", emoji: "📨", count: emailCampaigns.length },
          ]}
        />
      </div>

      {tab === "sequences" && (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {emailSequences.map((s) => (
            <Card key={s.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-[14px] font-bold text-ink">{s.name}</h3>
                    {s.active ? (
                      <Pill tone="green" size="xs"><Dot tone="green" live /> Đang chạy</Pill>
                    ) : (
                      <Pill tone="neutral" size="xs">Tắt</Pill>
                    )}
                  </div>
                  <div className="mt-0.5 text-[12px] text-muted">⚡ Kích hoạt: {s.trigger}</div>
                </div>
                <Toggle defaultChecked={s.active} label={s.name} />
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2 text-[12px]">
                <div>
                  <div className="eyebrow">Bước</div>
                  <div className="mt-0.5 font-semibold tabular-nums text-ink">{s.steps} email</div>
                </div>
                <div>
                  <div className="eyebrow">Đang trong chuỗi</div>
                  <div className="mt-0.5 font-semibold tabular-nums text-ink">{formatNumber(s.subscribers)}</div>
                </div>
                <div>
                  <div className="eyebrow">Mở</div>
                  <div className="mt-0.5 font-semibold tabular-nums text-ink">{s.openRate}%</div>
                  <ProgressBar value={s.openRate} className="mt-1" tone={s.openRate >= 40 ? "green" : "gold"} />
                </div>
                <div>
                  <div className="eyebrow">Click</div>
                  <div className="mt-0.5 font-semibold tabular-nums text-ink">{s.clickRate}%</div>
                  <ProgressBar value={s.clickRate * 5} className="mt-1" tone="blue" />
                </div>
              </div>
              <div className="mt-3 flex gap-1.5 border-t border-border pt-3">
                <Button size="xs">✏️ Sửa kịch bản</Button>
                <Button size="xs" variant="soft">🤖 AI tối ưu tiêu đề</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === "campaigns" && (
        <Card className="mt-4">
          <CardHeader icon="📨" title="Chiến dịch email" subtitle="Gửi một lần tới phân khúc. Bản nháp AI cần bạn duyệt." />
          <Table>
            <thead>
              <tr>
                <Th>Tiêu đề</Th>
                <Th>Trạng thái</Th>
                <Th>Thời gian</Th>
                <Th className="text-right">Người nhận</Th>
                <Th className="text-right">Mở</Th>
                <Th className="text-right">Click</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {emailCampaigns.map((e) => (
                <tr key={e.id} className="hover:bg-bg-elevated">
                  <Td className="font-medium text-ink">{e.subject}</Td>
                  <Td>
                    {e.status === "sent" && <Pill tone="green">Đã gửi</Pill>}
                    {e.status === "scheduled" && <Pill tone="blue">Đã lên lịch</Pill>}
                    {e.status === "draft" && <Pill tone="gold">Nháp – chờ duyệt</Pill>}
                  </Td>
                  <Td className="tabular-nums text-muted">{e.sentAt ? formatDateTime(e.sentAt) : "—"}</Td>
                  <Td className="text-right tabular-nums">{formatNumber(e.recipients)}</Td>
                  <Td className="text-right tabular-nums">{e.openRate !== undefined ? `${e.openRate}%` : "—"}</Td>
                  <Td className="text-right tabular-nums">{e.clickRate !== undefined ? `${e.clickRate}%` : "—"}</Td>
                  <Td className="text-right">
                    {e.status === "draft" ? (
                      <Button size="xs" variant="primary">Xem & duyệt</Button>
                    ) : (
                      <Button size="xs" variant="ghost">Chi tiết</Button>
                    )}
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
