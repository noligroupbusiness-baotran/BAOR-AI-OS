import { Panel, PanelHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmAction } from "@/components/campaigns/confirm-action";
import { cancelVideoPostAction, retryVideoPostAction, setDryRunAction } from "@/lib/actions/publishing";
import { createAdDraftAction } from "@/lib/actions/ads";
import { Button } from "@/components/ui/button";
import { VIDEO_CHANNELS, channelStatus, isDryRun, listVideoPosts } from "@/lib/publishing/video";
import { postStatusLabel } from "@/lib/labels";
import { fileUrl } from "@/lib/uploads";
import { formatDateTime, formatNumber } from "@/lib/format";
import type { PostStatus } from "@/lib/types";

// CP04: bài video — chờ đăng, đang xác minh, đã đăng (có đường dẫn từ nền tảng), lỗi, chế độ thử.
export function VideoPostsPanel() {
  const posts = listVideoPosts();
  const dry = isDryRun();
  return (
    <Panel id="video-posts">
      <PanelHeader
        title="Bài video"
        sub="Chỉ video OWNER đã duyệt. “Đã đăng” chỉ khi nền tảng trả mã bài và hệ thống đọc lại được bài. Chế độ thử kiểm đủ điều kiện nhưng không gọi nền tảng."
        action={
          <ConfirmAction
            action={setDryRunAction}
            fields={{ on: dry ? "0" : "1" }}
            label={dry ? "Đang ở chế độ thử" : "Đang đăng thật"}
            title={dry ? "Tắt chế độ thử?" : "Bật chế độ thử?"}
            message={dry ? "Bài mới lên lịch sẽ ĐĂNG THẬT lên kênh đã kết nối. Chỉ OWNER quyết định việc này." : "Bài mới lên lịch sẽ không đăng thật."}
            confirmLabel={dry ? "Tắt chế độ thử" : "Bật chế độ thử"}
            variant={dry ? "soft" : "outline"}
          />
        }
      />
      <div className="flex flex-wrap gap-1.5 border-b border-border px-4 py-2 text-[12px]">
        {VIDEO_CHANNELS.map((c) => {
          const st = channelStatus(c.platform);
          return <Pill key={c.platform} tone={st.canPublish ? "jade" : c.blocked ? "neutral" : "amber"}>{c.label}: {st.reason}</Pill>;
        })}
      </div>
      {posts.length === 0 ? (
        <EmptyState title="Chưa có bài video" hint="Phê duyệt video ở Video Studio rồi bấm Lên lịch đăng." />
      ) : (
        <ul className="m-0 list-none p-0">
          {posts.map((p) => {
            const st = postStatusLabel[p.status as PostStatus] ?? { label: p.status, tone: "neutral" as const };
            return (
              <li key={p.id} className="grid gap-2 border-b border-border px-4 py-2.5 last:border-b-0 md:grid-cols-[56px_minmax(0,1fr)_auto] md:items-center">
                {p.thumbnailUploadId ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={fileUrl(p.thumbnailUploadId)} alt="" className="h-[72px] w-[40px] rounded border border-border object-cover" />
                ) : <span />}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-semibold text-ink">{p.title}</span>
                    <Pill tone={st.tone}>{st.label}</Pill>
                    <span className="text-[12px] text-ink-2">{p.platform}</span>
                    {p.mode === "dry_run" && <Pill tone="violet">thử</Pill>}
                  </div>
                  <div className="mt-0.5 text-[12px] text-ink-2">
                    Giờ đăng <span className="num">{formatDateTime(p.scheduledFor)}</span> · thử <span className="num">{p.attempts}</span> lần
                    {p.views != null && <> · <span className="num">{formatNumber(p.views)}</span> lượt xem</>}
                    {p.reach != null && <> · tiếp cận <span className="num">{formatNumber(p.reach)}</span></>}
                  </div>
                  {p.permalink && <a href={p.permalink} target="_blank" rel="noreferrer" className="text-[12px] text-jade hover:underline">{p.permalink}</a>}
                  {p.error && <div className="text-[12px] text-ink-2">{p.error}</div>}
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
                <div className="flex gap-1.5">
                  {p.status === "failed" && !p.externalId && <ConfirmAction action={retryVideoPostAction} fields={{ id: p.id }} label="Thử lại" title="Thử đăng lại?" message="Bài sẽ được đăng ở lượt chạy tới." confirmLabel="Thử lại" variant="soft" />}
                  {p.status === "scheduled" && <ConfirmAction action={cancelVideoPostAction} fields={{ id: p.id }} label="Huỷ" title="Huỷ bài chờ đăng?" message="Bài không được đăng; có thể lên lịch lại sau." confirmLabel="Huỷ bài" danger />}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
