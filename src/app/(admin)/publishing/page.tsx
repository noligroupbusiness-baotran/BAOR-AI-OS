import { PageHead, Panel, PanelHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { Tiles, Tile } from "@/components/ui/stat";
import { Table, Th, Td } from "@/components/ui/table";
import { platformLabel } from "@/components/ui/platform";
import { approveAd, rejectAd, retryPost, saveGuardrails, toggleAd, updateBudget } from "@/lib/actions/ads";
import { getAdGuardrails, listAds, listPosts } from "@/lib/queries";
import { adStatusLabel, postStatusLabel } from "@/lib/labels";
import { formatNumber, formatTime, formatDate, cn } from "@/lib/format";
import type { AdStatus, Platform, PostStatus } from "@/lib/types";

export const metadata = { title: "Đăng bài & quảng cáo – BAOR AI OS" };

const input = "h-8 rounded-md border border-border-2 bg-surface px-2.5 text-[13px] text-ink outline-none focus-visible:outline-2 focus-visible:outline-jade";

export default async function PublishingPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const { edit } = await searchParams;
  const g = getAdGuardrails();
  const posts = listPosts();
  const ads = listAds().filter((a) => a.status !== "rejected");
  const queue = posts.filter((p) => p.status === "scheduled");
  const published = posts.filter((p) => p.status === "published");
  const failed = posts.filter((p) => p.status === "failed");
  const avgReach = published.length ? Math.round(published.reduce((n, p) => n + (p.reach ?? 0), 0) / published.length) : 0;
  const spentMonth = ads.reduce((n, a) => n + a.spent, 0);

  type RowT = { ids: string[]; title: string; at: string; platforms: string[]; status: string; reach: number; error?: string | null };
  const rows = Object.values(
    posts.reduce<Record<string, RowT>>((acc, p) => {
      const key = `${p.contentId}-${p.status}-${p.scheduledFor.slice(0, 10)}`;
      if (!acc[key]) acc[key] = { ids: [], title: p.title, at: p.scheduledFor, platforms: [], status: p.status, reach: 0, error: p.error };
      acc[key].ids.push(p.id);
      acc[key].platforms.push(platformLabel(p.platform as Platform));
      acc[key].reach += p.reach ?? 0;
      return acc;
    }, {}),
  ).sort((a, b) => b.at.localeCompare(a.at));

  return (
    <>
      <PageHead
        title="Đăng bài & quảng cáo"
        sub="Bài đã duyệt tự đăng đúng giờ. Bài tốt được đề xuất chạy ads, nhưng tiền chỉ tiêu khi bạn duyệt."
      />

      <Tiles>
        <Tile label="Chờ đăng" value={String(queue.length)} hint="Sẽ tự đăng khi nối Facebook" />
        <Tile label="Đã đăng" value={String(published.length)} hint={avgReach ? `Reach TB ${formatNumber(avgReach)} / bài` : "Chưa có số liệu"} />
        <Tile label="Ads đang chạy" value={String(ads.filter((a) => a.status === "active").length)} hint={`Đã chi ${formatNumber(spentMonth)} ₫`} />
        <Tile label="Lỗi đăng" value={String(failed.length)} hint={failed[0]?.error?.split(".")[0] ?? "Không có"} tone={failed.length ? "brick" : undefined} />
      </Tiles>

      <Panel>
        <PanelHeader title="Lịch đăng" sub="Mới nhất ở trên. Lên lịch bài mới ở mục Nội dung › Đã duyệt." />
        <Table>
          <thead>
            <tr><Th>Giờ</Th><Th>Bài</Th><Th>Kênh</Th><Th right>Trạng thái</Th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><Td className="text-center text-ink-2">Chưa có bài nào.</Td></tr>}
            {rows.map((r) => {
              const st = postStatusLabel[r.status as PostStatus];
              return (
                <tr key={r.ids.join()}>
                  <Td className="num whitespace-nowrap">{formatTime(r.at)} · {formatDate(r.at).slice(0, 5)}</Td>
                  <Td className="font-semibold text-ink">{r.title}{r.error && <div className="text-[12px] font-normal text-brick">{r.error}</div>}</Td>
                  <Td>{r.platforms.join(" · ")}</Td>
                  <Td right>
                    {r.status === "failed" ? (
                      <form action={retryPost}><input type="hidden" name="id" value={r.ids[0]} /><Button type="submit">Đăng lại</Button></form>
                    ) : (
                      <Pill tone={st.tone} className="num">{st.label}{r.reach ? ` · ${formatNumber(r.reach)} reach` : ""}</Pill>
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
          sub={`Hạn mức ${formatNumber(g.dailyCap)} ₫/ngày · ${formatNumber(g.monthlyCap)} ₫/tháng. Tự dừng khi chi phí/lead vượt ${formatNumber(g.autoPauseCplAbove)} ₫.`}
        />
        <Table>
          <thead>
            <tr><Th>Chiến dịch</Th><Th right>Ngân sách/ngày</Th><Th right>Chi phí/lead</Th><Th right>Trạng thái</Th></tr>
          </thead>
          <tbody>
            {ads.map((a) => {
              const st = adStatusLabel[a.status as AdStatus];
              const cpl = a.leads ? Math.round(a.spent / a.leads) : 0;
              const editing = edit === a.id;
              return (
                <tr key={a.id}>
                  <Td>
                    <div className="font-semibold text-ink">{a.name}</div>
                    {a.aiNote && <div className="text-[12px] text-ink-2">{a.aiNote}</div>}
                  </Td>
                  <Td right className="num whitespace-nowrap">
                    {editing ? (
                      <form action={updateBudget} className="flex justify-end gap-1.5">
                        <input type="hidden" name="id" value={a.id} />
                        <input name="dailyBudget" defaultValue={a.dailyBudget} className={cn(input, "w-[110px] text-right")} />
                        <Button type="submit" variant="primary">Lưu</Button>
                      </form>
                    ) : (
                      <a href={`/publishing?edit=${a.id}`} className="hover:underline">{formatNumber(a.dailyBudget)} ₫</a>
                    )}
                  </Td>
                  <Td right className={cn("num whitespace-nowrap", cpl > g.autoPauseCplAbove && "text-brick")}>{cpl ? `${formatNumber(cpl)} ₫` : "—"}</Td>
                  <Td right>
                    <div className="flex justify-end gap-1.5">
                      {a.status === "pending_approval" && (
                        <>
                          <form action={approveAd}><input type="hidden" name="id" value={a.id} /><Button variant="primary" type="submit">Duyệt chạy</Button></form>
                          <form action={rejectAd}><input type="hidden" name="id" value={a.id} /><Button variant="ghost" type="submit">Từ chối</Button></form>
                        </>
                      )}
                      {(a.status === "active" || a.status === "paused") && (
                        <>
                          <Pill tone={st.tone}>{st.label}</Pill>
                          <form action={toggleAd}><input type="hidden" name="id" value={a.id} /><Button variant="ghost" type="submit">{a.status === "active" ? "Tạm dừng" : "Bật lại"}</Button></form>
                        </>
                      )}
                      {a.status === "proposed" && <Pill tone={st.tone}>{st.label}</Pill>}
                      {a.status === "ended" && <Pill tone={st.tone}>{st.label}</Pill>}
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Panel>

      <Panel>
        <PanelHeader title="Hạn mức ngân sách" sub="AI không bao giờ vượt các mức này, kể cả khi hiệu quả tốt." />
        <form action={saveGuardrails} className="flex flex-wrap items-end gap-3 p-4">
          <label className="block"><span className="lbl">Tối đa / ngày (₫)</span><br /><input name="dailyCap" defaultValue={g.dailyCap} className={cn(input, "mt-1 w-[140px]")} /></label>
          <label className="block"><span className="lbl">Tối đa / tháng (₫)</span><br /><input name="monthlyCap" defaultValue={g.monthlyCap} className={cn(input, "mt-1 w-[140px]")} /></label>
          <label className="block"><span className="lbl">Tự dừng khi CPL vượt (₫)</span><br /><input name="autoPauseCplAbove" defaultValue={g.autoPauseCplAbove} className={cn(input, "mt-1 w-[140px]")} /></label>
          <Button variant="primary" type="submit">Lưu hạn mức</Button>
        </form>
      </Panel>
    </>
  );
}
