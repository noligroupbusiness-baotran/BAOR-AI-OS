import { PageHead, Panel, PanelHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { Tiles, Tile } from "@/components/ui/stat";
import { Table, Th, Td } from "@/components/ui/table";
import { platformLabel } from "@/components/ui/platform";
import { scheduledPosts } from "@/lib/data/content";
import { adBudgetGuardrails, adCampaigns } from "@/lib/data/ads";
import { adStatusLabel, postStatusLabel } from "@/lib/labels";
import { formatNumber, formatTime, formatDate } from "@/lib/format";

export const metadata = { title: "Đăng bài & quảng cáo – BAOR AI OS" };

export default function PublishingPage() {
  const g = adBudgetGuardrails;
  const queue = scheduledPosts.filter((p) => p.status === "scheduled");
  const published = scheduledPosts.filter((p) => p.status === "published");
  const failed = scheduledPosts.filter((p) => p.status === "failed");
  const avgReach = Math.round(published.reduce((n, p) => n + (p.reach ?? 0), 0) / Math.max(1, published.length));
  // Gộp bài trùng tên trên nhiều kênh thành một dòng
  const rows = Object.values(
    scheduledPosts.reduce<Record<string, { id: string; title: string; at: string; platforms: string[]; status: string; reach?: number; error?: string }>>((acc, p) => {
      const key = `${p.contentId}-${p.status}`;
      if (!acc[key]) acc[key] = { id: p.id, title: p.title, at: p.scheduledFor, platforms: [], status: p.status, reach: p.reach, error: p.error };
      acc[key].platforms.push(platformLabel(p.platform));
      return acc;
    }, {}),
  ).sort((a, b) => b.at.localeCompare(a.at));

  return (
    <>
      <PageHead
        title="Đăng bài & quảng cáo"
        sub="Bài đã duyệt tự đăng đúng giờ vàng. Bài tốt được đề xuất chạy ads, nhưng tiền chỉ tiêu khi bạn duyệt."
        action={<Button variant="primary" size="md">Xếp lịch tuần sau</Button>}
      />

      <Tiles>
        <Tile label="Chờ đăng" value={String(queue.length)} hint="Tuần này" />
        <Tile label="Đã đăng 7 ngày" value={String(published.length)} delta="▲ 14%" hint={`Reach TB ${formatNumber(avgReach)} / bài`} />
        <Tile label="Ads đang chạy" value={String(adCampaigns.filter((a) => a.status === "active").length)} hint="Tối ưu mỗi 6 giờ" />
        <Tile label="Lỗi đăng" value={String(failed.length)} hint={failed[0]?.error?.split(".")[0] ?? "Không có"} tone={failed.length ? "brick" : undefined} />
      </Tiles>

      <Panel>
        <PanelHeader title="Lịch đăng" sub="Tuần này, mới nhất ở trên." />
        <Table>
          <thead>
            <tr>
              <Th>Giờ</Th>
              <Th>Bài</Th>
              <Th>Kênh</Th>
              <Th right>Trạng thái</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const st = postStatusLabel[r.status as keyof typeof postStatusLabel];
              return (
                <tr key={r.id}>
                  <Td className="num whitespace-nowrap">
                    {formatTime(r.at)} · {formatDate(r.at).slice(0, 5)}
                  </Td>
                  <Td className="font-semibold text-ink">{r.title}</Td>
                  <Td>{r.platforms.join(" · ")}</Td>
                  <Td right>
                    {r.status === "failed" ? (
                      <Button variant="outline">Đăng lại</Button>
                    ) : (
                      <Pill tone={st.tone} className="num">
                        {st.label}
                        {r.reach ? ` · ${formatNumber(r.reach)} reach` : ""}
                      </Pill>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Panel>

      <Panel>
        <PanelHeader
          title="Quảng cáo"
          sub={`Hạn mức ${formatNumber(g.dailyCap)} ₫/ngày · ${formatNumber(g.monthlyCap / 1e6)} triệu/tháng. Tự dừng khi chi phí/lead vượt ${formatNumber(g.autoPauseCplAbove)} ₫.`}
        />
        <Table>
          <thead>
            <tr>
              <Th>Chiến dịch</Th>
              <Th right>Ngân sách/ngày</Th>
              <Th right>Chi phí/lead</Th>
              <Th right>Trạng thái</Th>
            </tr>
          </thead>
          <tbody>
            {adCampaigns
              .filter((a) => a.status !== "proposed")
              .map((a) => {
                const st = adStatusLabel[a.status];
                const cpl = a.leads ? Math.round(a.spent / a.leads) : 0;
                return (
                  <tr key={a.id}>
                    <Td>
                      <div className="font-semibold text-ink">{a.name}</div>
                      {a.aiNote && <div className="text-[12px] text-ink-2">{a.aiNote}</div>}
                    </Td>
                    <Td right className="num whitespace-nowrap">{formatNumber(a.dailyBudget)} ₫</Td>
                    <Td right className={`num whitespace-nowrap ${cpl > g.autoPauseCplAbove ? "text-brick" : ""}`}>
                      {cpl ? `${formatNumber(cpl)} ₫` : "—"}
                    </Td>
                    <Td right>
                      {a.status === "pending_approval" ? (
                        <Button variant="primary">Duyệt chạy</Button>
                      ) : (
                        <Pill tone={st.tone}>{st.label}</Pill>
                      )}
                    </Td>
                  </tr>
                );
              })}
          </tbody>
        </Table>
      </Panel>
    </>
  );
}
