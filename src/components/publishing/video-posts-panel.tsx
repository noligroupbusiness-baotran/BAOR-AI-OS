import { platformLabel } from "@/components/ui/platform";
import type { Platform } from "@/lib/types";
import { Panel, PanelHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmAction } from "@/components/campaigns/confirm-action";
import { setDryRunAction } from "@/lib/actions/publishing";
import { PostActions, postErrorShort } from "@/components/publishing/post-actions";
import { createAdDraftAction } from "@/lib/actions/ads";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { Button, LinkButton } from "@/components/ui/button";
import { latestJob } from "@/lib/video/jobs";
import { videoChannels, channelPageIds, channelStatus, isDryRun, listVideoPosts } from "@/lib/publishing/video";
import { postStatusLabel } from "@/lib/labels";
import { postInCampaign } from "@/lib/campaigns/filter";
import { fileUrl } from "@/lib/uploads";
import { formatDateTime, formatNumber } from "@/lib/format";
import type { PostStatus } from "@/lib/types";

// CP04: bài video — chờ đăng, đang xác minh, đã đăng (có đường dẫn từ nền tảng), lỗi, chế độ thử.
// Bước 6 của hành trình video (OWNER 25/10/2026 "khâu 4 5 6 mượt nhất"): mỗi bài có ảnh xem trước, kênh, giờ, chế độ thử và nút
// quay lại video trong Kho; ?video=<id> (từ Kho / sau khi lên lịch) làm nổi bật bài của video đó.
const PENDING = new Set(["scheduled", "publishing", "verifying"]);

function previewOf(videoId: string | null): string | null {
  if (!videoId) return null;
  const jv = latestJob(videoId);
  if (jv?.job.status === "done" && jv.files.includes("preview.mp4")) return `/api/video-jobs/${videoId}/v${jv.job.version}/preview.mp4`;
  const v = getDb().select({ uploadId: schema.videos.uploadId, purged: schema.videos.filesPurgedAt }).from(schema.videos).where(eq(schema.videos.id, videoId)).get();
  return v?.uploadId && !v.purged ? fileUrl(v.uploadId) : null;
}

/** campaignIds: đang lọc theo chiến dịch (?campaign=&goal=) → chỉ bài đã gắn chiến dịch hoặc bài của video đã gắn chiến dịch. */
export function VideoPostsPanel({ focus, owner = false, campaignIds = null }: { focus?: string; owner?: boolean; campaignIds?: Set<string> | null }) {
  const posts = listVideoPosts().filter((p) => postInCampaign(p, campaignIds));
  const dry = isDryRun();
  const pages = owner ? channelPageIds() : undefined;
  return (
    <Panel id="video-posts">
      <PanelHeader
        title="Bài video"
        sub="Video đã duyệt ở Kho. “Đã đăng” chỉ khi đọc lại được bài trên nền tảng. Chế độ thử không gọi nền tảng."
        action={
          <ConfirmAction
            action={setDryRunAction}
            fields={{ on: dry ? "0" : "1" }}
            label={dry ? "Đang ở chế độ thử" : "Đang đăng thật"}
            title={dry ? "Tắt chế độ thử?" : "Bật chế độ thử?"}
            message={dry ? (owner ? "Bài mới lên lịch sẽ ĐĂNG THẬT lên kênh đã kết nối." : "Chỉ OWNER tắt được chế độ thử.") : "Bài mới lên lịch sẽ không đăng thật."}
            confirmLabel={dry ? "Tắt chế độ thử" : "Bật chế độ thử"}
            variant={dry ? "soft" : "outline"}
          />
        }
      />
      <div className="flex flex-wrap gap-1.5 border-b border-border px-4 py-2 text-[12px]">
        {videoChannels().map((c) => {
          const st = channelStatus(c.platform);
          return <Pill key={c.platform} tone={st.canPublish ? "jade" : c.blocked ? "neutral" : "amber"}>{c.label}: {st.reason}</Pill>;
        })}
      </div>
      {posts.length === 0 ? (
        <EmptyState title={campaignIds ? "Chiến dịch chưa có bài video" : "Chưa có bài video"} hint="Lên lịch từ Kho video." action={<LinkButton href="/video-library" variant="soft">Tới Kho video</LinkButton>} />
      ) : (
        <ul className="m-0 list-none p-0">
          {posts.map((p) => {
            const st = postStatusLabel[p.status as PostStatus] ?? { label: p.status, tone: "neutral" as const };
            const preview = p.thumbnailUploadId ? null : previewOf(p.videoId);
            const kho = p.videoId ? `/video-library?tab=${p.status === "published" ? "posted" : PENDING.has(p.status) ? "scheduled" : "unposted"}&focus=${encodeURIComponent(p.videoId)}#v-${encodeURIComponent(p.videoId)}` : null;
            return (
              <li key={p.id} className={`grid grid-cols-[72px_minmax(0,1fr)] gap-x-3 gap-y-2 border-b border-border px-4 py-2.5 last:border-b-0 md:grid-cols-[72px_minmax(0,1fr)_auto] md:items-center ${focus && p.videoId === focus ? "bg-jade-soft/40" : ""}`}>
                {p.thumbnailUploadId ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={fileUrl(p.thumbnailUploadId)} alt="" className="aspect-video w-[72px] rounded border border-border bg-black object-cover" />
                ) : preview ? (
                  <video src={`${preview}#t=1`} preload="metadata" muted playsInline aria-hidden className="pointer-events-none aspect-video w-[72px] rounded border border-border bg-black object-cover" />
                ) : (
                  <span className="aspect-video w-[72px] rounded border border-border bg-ground-2" />
                )}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-semibold text-ink">{p.title}</span>
                    <Pill tone={st.tone}>{st.label}</Pill>
                    <span className="text-[12px] text-ink-2">{platformLabel(p.platform as Platform)}</span>
                    {p.mode === "dry_run" && <Pill tone="violet">Chế độ thử</Pill>}
                  </div>
                  <div className="mt-0.5 text-[12px] text-ink-2">
                    Giờ đăng <span className="num">{formatDateTime(p.scheduledFor)}</span> · thử <span className="num">{p.attempts}</span> lần
                    {p.views != null && <> · <span className="num">{formatNumber(p.views)}</span> lượt xem</>}
                    {p.reach != null && <> · tiếp cận <span className="num">{formatNumber(p.reach)}</span></>}
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 text-[12px]">
                    {p.permalink && <a href={p.permalink} target="_blank" rel="noreferrer" className="font-medium text-jade hover:underline">Xem bài trên {platformLabel(p.platform as Platform)} ›</a>}
                    {kho && <Link href={kho} className="font-medium text-ink-2 hover:text-ink hover:underline">‹ Video trong Kho</Link>}
                  </div>
                  {p.error && <div title={p.error} className="text-[12px] text-ink-2">{postErrorShort(p)}</div>}
                  {p.status === "published" && p.mode === "live" && p.verifiedAt && (
                    <details className="mt-1 text-[12px]">
                      <summary className="cursor-pointer text-jade">Tạo nháp quảng cáo từ bài này</summary>
                      <form action={createAdDraftAction} className="mt-1.5 flex flex-wrap items-end gap-2">
                        <input type="hidden" name="postId" value={p.id} />
                        <label className="grid gap-0.5"><span className="text-ink-3">₫/ngày</span><input name="dailyBudget" defaultValue="100000" className="h-7 w-[100px] rounded-md border border-border-2 bg-surface px-2 text-ink" /></label>
                        <label className="grid gap-0.5"><span className="text-ink-3">Số ngày</span><input name="days" defaultValue="7" className="h-7 w-[60px] rounded-md border border-border-2 bg-surface px-2 text-ink" /></label>
                        <label className="grid gap-0.5"><span className="text-ink-3">Quốc gia</span><input name="countries" defaultValue="VN" className="h-7 w-[70px] rounded-md border border-border-2 bg-surface px-2 text-ink" /></label>
                        <label className="grid gap-0.5"><span className="text-ink-3">Tuổi</span><span className="flex gap-1"><input name="ageMin" defaultValue="22" className="h-7 w-[46px] rounded-md border border-border-2 bg-surface px-2 text-ink" /><input name="ageMax" defaultValue="45" className="h-7 w-[46px] rounded-md border border-border-2 bg-surface px-2 text-ink" /></span></label>
                        <Button type="submit" variant="soft">Tạo nháp (chưa tiêu tiền)</Button>
                      </form>
                    </details>
                  )}
                </div>
                <div className="col-span-2 flex gap-1.5 md:col-span-1">
                  <PostActions post={p} owner={owner} pages={pages} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
