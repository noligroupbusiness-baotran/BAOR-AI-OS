import { PageHead, Panel, PanelHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Tiles, Tile } from "@/components/ui/stat";
import { Table, Th, Td } from "@/components/ui/table";
import { platformLabel } from "@/components/ui/platform";
import { PostActions, postErrorShort } from "@/components/publishing/post-actions";
import { currentActor, isOwner } from "@/lib/permissions";
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
import { SamplePill } from "@/components/ui/sample";
import { CampaignFilterChip } from "@/components/campaigns/campaign-filter-chip";
import { isSamplePost } from "@/lib/sample";
import { isSampleAd, monthSpentDetail } from "@/lib/ads/authorization";
import { readCampaignContext, withCampaignContext } from "@/lib/campaigns/context";
import { campaignFilterFor, keepInCampaign } from "@/lib/campaigns/filter";

export const metadata = { title: "Đăng bài – BAOR AI OS" };


export default async function PublishingPage({ searchParams }: { searchParams: Promise<{ page?: string; view?: string; month?: string; video?: string; campaign?: string; goal?: string }> }) {
  const sp = await searchParams;
  const { page, view: viewParam, month: monthParam, video: focusVideo } = sp;
  const view = viewParam === "calendar" ? "calendar" : "list";
  const month = monthOf(monthParam);
  // Mở từ chiến dịch (?campaign=&goal=): chỉ hiện bài đăng / quảng cáo đã gắn chiến dịch đó.
  const ctx = readCampaignContext(sp);
  const filter = campaignFilterFor(ctx, ["publication", "ad"]);
  const keep = (path: string) => withCampaignContext(path, ctx);
  const posts = keepInCampaign(listPosts(), filter);
  const ads = keepInCampaign(listAds().filter((a) => a.status !== "rejected"), filter);
  // Số thật không lẫn số mẫu: bài / quảng cáo mẫu đếm riêng, nhãn "Mẫu" (như trang Quảng cáo).
  const real = posts.filter((p) => !isSamplePost(p));
  const samplePosts = posts.filter((p) => isSamplePost(p));
  const count = (list: typeof posts, st: string) => list.filter((p) => p.status === st);
  const queue = count(real, "scheduled");
  const published = count(real, "published");
  const failed = count(real, "failed");
  const samplePublished = count(samplePosts, "published");
  const avgReach = published.length ? Math.round(published.reduce((n, p) => n + (p.reach ?? 0), 0) / published.length) : 0;
  const activeReal = ads.filter((a) => a.status === "active" && !isSampleAd(a.id));
  const activeSample = ads.filter((a) => a.status === "active" && isSampleAd(a.id));
  // "Đã chi tháng" = đúng số của trang Quảng cáo (monthSpentDetail, đã bỏ mẫu); đang lọc chiến dịch → cộng đã chi của quảng cáo chiến dịch.
  const spentMonth = filter ? ads.filter((a) => !isSampleAd(a.id)).reduce((n, a) => n + a.spent, 0) : monthSpentDetail().total;
  const spentSample = ads.filter((a) => isSampleAd(a.id)).reduce((n, a) => n + a.spent, 0);
  const sampleNote = (n: number, noun: string, extra = "") => (n ? `${n} ${noun}${extra}` : undefined);
  const postLinks = campaignRepo.linksForEntities("publication", posts.map((p) => p.id));

  const owner = isOwner(await currentActor());
  // Bài cần thao tác (chờ / lỗi / quá hạn) mỗi bài một dòng để nút tác động đúng bài; bài chữ và video không gộp chung.
  const ACTIONABLE = new Set(["scheduled", "failed", "overdue"]);
  type RowT = { ids: string[]; post: (typeof posts)[number]; title: string; at: string; platforms: string[]; status: string; reach: number; error?: string | null; video: boolean; sample: boolean };
  const rows = Object.values(
    posts.reduce<Record<string, RowT>>((acc, p) => {
      const key = ACTIONABLE.has(p.status) ? p.id : `${p.videoId ? `v:${p.videoId}` : p.contentId}-${p.status}-${p.scheduledFor.slice(0, 10)}`;
      if (!acc[key]) acc[key] = { ids: [], post: p, title: p.title, at: p.scheduledFor, platforms: [], status: p.status, reach: 0, error: p.error, video: !!p.videoId, sample: isSamplePost(p) };
      acc[key].ids.push(p.id);
      acc[key].platforms.push(platformLabel(p.platform as Platform));
      acc[key].reach += p.reach ?? 0;
      return acc;
    }, {}),
  ).sort((a, b) => b.at.localeCompare(a.at));
  const rowPage = paginate(rows, page);

  return (
    <>
      <PageHead
        title="Đăng bài"
        sub="Lịch đăng và bài đã đăng."
      />

      <CampaignFilterChip filter={filter} missing={!!ctx.campaignId && !filter} clearHref={withCampaignContext(`/publishing${view === "calendar" ? "?view=calendar" : ""}`, {})} />

      <Tiles>
        <Tile label="Chờ đăng" value={String(queue.length)} hint="Sẽ tự đăng khi nối Facebook" sample={sampleNote(count(samplePosts, "scheduled").length, "bài")} />
        <Tile label="Đã đăng" value={String(published.length)} hint={avgReach ? `Reach TB ${formatNumber(avgReach)} / bài` : "Chưa có số liệu"} sample={sampleNote(samplePublished.length, "bài")} />
        <Tile label="Ads đang chạy" value={String(activeReal.length)} hint={`${filter ? "Đã chi" : "Đã chi tháng"} ${formatNumber(spentMonth)} ₫`} sample={activeSample.length || spentSample ? `${activeSample.length} ads · ${formatNumber(spentSample)} ₫` : undefined} />
        <Tile label="Lỗi đăng" value={String(failed.length)} hint={failed[0]?.error?.split(".")[0] ?? "Không có"} tone={failed.length ? "brick" : undefined} sample={sampleNote(count(samplePosts, "failed").length, "bài")} />
      </Tiles>

      <VideoPostsPanel focus={focusVideo} owner={owner} campaignIds={campaignFilterFor(ctx, ["publication", "video"])?.ids ?? null} />

      <div className="mt-3.5"><Segment basePath={keep("/publishing")} active={view} items={[{ key: "list", label: "Danh sách" }, { key: "calendar", label: "Lịch tháng" }]} paramName="view" /></div>

      {view === "calendar" && (
        <MonthCalendar
          month={month}
          hrefFor={(m) => keep(`/publishing?view=calendar&month=${m}`)}
          posts={posts.map((p) => ({ id: `${p.contentId}::${p.id}`, title: p.title, at: p.scheduledFor, platforms: [platformLabel(p.platform as Platform)], status: p.status as PostStatus }))}
        />
      )}

      {view === "list" && <Panel>
        <PanelHeader title="Lịch đăng" />
        <Table>
          <thead>
            <tr><Th>Giờ</Th><Th>Bài</Th><Th>Kênh</Th><Th right>Trạng thái</Th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><Td className="text-center text-ink-2">{filter ? "Chiến dịch chưa có bài." : "Chưa có bài nào."}</Td></tr>}
            {rowPage.items.map((r) => {
              const st = postStatusLabel[r.status as PostStatus];
              return (
                <tr key={r.ids.join()}>
                  <Td className="num whitespace-nowrap">{formatTime(r.at)} · {formatDate(r.at).slice(0, 5)}</Td>
                  <Td className="font-semibold text-ink">
                    {r.title}
                    {r.sample && <span className="ml-1.5 align-middle"><SamplePill title="Bài mẫu (dữ liệu demo): không bao giờ đăng thật" /></span>}
                    {/* Bài mẫu quá hạn: không hiện lời nhắc "Xếp lại" (bài mẫu không xếp lại được), chỉ nhãn Mẫu */}
                    {r.error && !(r.sample && r.status === "overdue") && <div title={r.error} className={cn("text-[12px] font-normal", r.status === "failed" ? "text-brick" : "text-amber")}>{postErrorShort(r.post)}</div>}
                    <div className="mt-1 flex flex-wrap gap-1"><CampaignTags links={r.ids.flatMap((id) => postLinks.get(id) ?? []).filter((l, i, arr) => arr.findIndex((x) => x.campaignId === l.campaignId) === i)} /></div>
                  </Td>
                  <Td>{r.platforms.join(" · ")}</Td>
                  <Td right>
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      <Pill tone={st?.tone ?? "neutral"} className="num">{r.sample && r.status === "overdue" ? "Quá hạn" : st?.label ?? r.status}{r.reach ? ` · ${formatNumber(r.reach)} reach` : ""}</Pill>
                      {/* Bài video thao tác ở mục Bài video phía trên (cùng nút) */}
                      {!r.video && <PostActions post={r.post} owner={owner} />}
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
        <Pager page={rowPage.page} pages={rowPage.pages} total={rowPage.total} hrefFor={(p) => keep(`/publishing?page=${p}`)} label="bài" />
      </Panel>}
    </>
  );
}
