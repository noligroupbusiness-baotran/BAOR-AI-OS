import { Button } from "@/components/ui/button";
import { scheduleVideoAction } from "@/lib/actions/publishing";
import { VIDEO_CHANNELS, channelStatus, isDryRun, suggestCaption, videoPostsFor } from "@/lib/publishing/video";
import { postStatusLabel } from "@/lib/labels";
import { Pill } from "@/components/ui/pill";
import type { PostStatus } from "@/lib/types";

// Lên lịch đăng một video đã duyệt: chọn kênh, giờ, caption. Kênh chưa có adapter hoặc chưa kết nối được ghi rõ lý do.
export function VideoScheduleForm({ videoId, back }: { videoId: string; back: string }) {
  const dry = isDryRun();
  const posts = videoPostsFor(videoId);
  const input = "h-8 rounded-md border border-border-2 bg-surface px-2.5 text-[13px] text-ink";
  return (
    <div className="mt-3 rounded-md border border-border bg-ground px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12.5px] font-semibold text-ink">Lên lịch đăng</span>
        {dry ? <Pill tone="violet">Chế độ thử: không đăng thật</Pill> : <Pill tone="jade">Đăng thật khi kênh đã kết nối</Pill>}
        {posts.map((p) => (
          <Pill key={p.id} tone={postStatusLabel[p.status as PostStatus]?.tone ?? "neutral"}>{p.platform}: {postStatusLabel[p.status as PostStatus]?.label ?? p.status}</Pill>
        ))}
      </div>
      <form action={scheduleVideoAction} className="mt-2 grid gap-2">
        <input type="hidden" name="id" value={videoId} />
        <input type="hidden" name="back" value={back} />
        <div className="flex flex-wrap gap-3 text-[12.5px]">
          {VIDEO_CHANNELS.map((c) => {
            const st = channelStatus(c.platform);
            const usable = !c.blocked && (st.canPublish || dry);
            return (
              <label key={c.platform} className="flex items-center gap-1.5" title={st.reason}>
                <input type="checkbox" name="platform" value={c.platform} disabled={!usable} defaultChecked={c.platform === "facebook" && usable} className="accent-[var(--jade)]" />
                <span className={usable ? "text-ink" : "text-ink-3"}>{c.label}</span>
                {!usable && <span className="text-[11px] text-amber">{c.blocked ? "chưa hỗ trợ" : "chưa kết nối"}</span>}
              </label>
            );
          })}
        </div>
        <textarea name="caption" rows={4} defaultValue={suggestCaption(videoId)} className="w-full rounded-md border border-border-2 bg-surface px-2.5 py-1.5 text-[13px] text-ink" />
        <div className="flex flex-wrap items-center gap-2">
          <input type="datetime-local" name="when" required className={input} />
          <Button type="submit" variant="primary">Lên lịch</Button>
          <span className="text-[11.5px] text-ink-3">Ảnh bìa lấy tự động ở 20% thời lượng. Một video chỉ một bài mỗi kênh.</span>
        </div>
      </form>
    </div>
  );
}
