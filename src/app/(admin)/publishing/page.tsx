import { PageHead, Panel, PanelHeader } from "@/components/ui/card";
import { Breadcrumb, ModuleGroups } from "@/components/shell/module-page";
import { Pill } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { Tiles, Tile } from "@/components/ui/stat";
import { Table, Th, Td } from "@/components/ui/table";
import { platformLabel } from "@/components/ui/platform";
import { retryPost } from "@/lib/actions/ads";
import { AdsPanel } from "@/components/publishing/ads-panel";
import { listAds, listPosts } from "@/lib/queries";
import { postStatusLabel } from "@/lib/labels";
import { formatNumber, formatTime, formatDate, cn } from "@/lib/format";
import type { Platform, PostStatus } from "@/lib/types";
import { CampaignTags } from "@/components/campaigns/entity-campaign";
import { campaignRepo } from "@/lib/campaigns/repository";
import { Pager, paginate } from "@/components/ui/pager";
import { MonthCalendar, monthOf } from "@/components/publishing/month-calendar";
import { Segment } from "@/components/ui/segment";
import { VideoPostsPanel } from "@/components/publishing/video-posts-panel";

export const metadata = { title: "Đăng bài & quảng cáo – BAOR AI OS" };


export default async function PublishingPage({ searchParams }: { searchParams: Promise<{ edit?: string; link?: string; page?: string; view?: string; month?: string }> }) {
  const { edit, link, page, view: viewParam, month: monthParam } = await searchParams;
  const view = viewParam === "calendar" ? "calendar" : "list";
  const month = monthOf(monthParam);
  const posts = listPosts();
  const ads = listAds().filter((a) => a.status !== "rejected");
  const queue = posts.filter((p) => p.status === "scheduled");
  const published = posts.filter((p) => p.status === "published");
  const failed = posts.filter((p) => p.status === "failed");
  const avgReach = published.length ? Math.round(published.reduce((n, p) => n + (p.reach ?? 0), 0) / published.length) : 0;
  const spentMonth = ads.reduce((n, a) => n + a.spent, 0);
  const postLinks = campaignRepo.linksForEntities("publication", posts.map((p) => p.id));

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
  const rowPage = paginate(rows, page);

  return (
    <>
      <Breadcrumb items={[{ label: "Điều hành", href: "/dashboard" }, { label: "Đăng bài & Quảng cáo" }]} />
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

      <VideoPostsPanel />

      <div className="mt-3.5"><Segment basePath="/publishing" active={view} items={[{ key: "list", label: "Danh sách" }, { key: "calendar", label: "Lịch tháng" }]} paramName="view" /></div>

      {view === "calendar" && (
        <MonthCalendar
          month={month}
          hrefFor={(m) => `/publishing?view=calendar&month=${m}`}
          posts={posts.map((p) => ({ id: `${p.contentId}::${p.id}`, title: p.title, at: p.scheduledFor, platforms: [platformLabel(p.platform as Platform)], status: p.status as PostStatus }))}
        />
      )}

      {view === "list" && <Panel>
        <PanelHeader title="Lịch đăng" sub="Mới nhất ở trên. Lên lịch bài mới ở mục Nội dung › Đã duyệt." />
        <Table>
          <thead>
            <tr><Th>Giờ</Th><Th>Bài</Th><Th>Kênh</Th><Th right>Trạng thái</Th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><Td className="text-center text-ink-2">Chưa có bài nào.</Td></tr>}
            {rowPage.items.map((r) => {
              const st = postStatusLabel[r.status as PostStatus];
              return (
                <tr key={r.ids.join()}>
                  <Td className="num whitespace-nowrap">{formatTime(r.at)} · {formatDate(r.at).slice(0, 5)}</Td>
                  <Td className="font-semibold text-ink">
                    {r.title}
                    {r.error && <div className={cn("text-[12px] font-normal", r.status === "failed" ? "text-brick" : "text-amber")}>{r.error}</div>}
                    <div className="mt-1 flex flex-wrap gap-1"><CampaignTags links={r.ids.flatMap((id) => postLinks.get(id) ?? []).filter((l, i, arr) => arr.findIndex((x) => x.campaignId === l.campaignId) === i)} /></div>
                  </Td>
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
        <Pager page={rowPage.page} pages={rowPage.pages} total={rowPage.total} hrefFor={(p) => `/publishing?page=${p}`} label="bài" />
      </Panel>}

      <AdsPanel edit={edit} link={link} />
      <ModuleGroups moduleKey="publishing" />
    </>
  );
}
