import { Button } from "@/components/ui/button";
import { aiCaptionAction, resetCaptionAction, scheduleVideoAction } from "@/lib/actions/publishing";
import { buildCaption, buildPostTitle, captionDraft, captionIssues, POST_TITLE_MAX, postDraftSource, postTitle, scriptTextFor } from "@/lib/publishing/caption";
import { goldenHours, suggestPostTimes } from "@/lib/publishing/post-times";
import { WhenPicker } from "@/components/publishing/when-picker";
import { videoChannels, channelStatus, isDryRun, suggestCaption, videoPostsFor } from "@/lib/publishing/video";
import { postStatusLabel } from "@/lib/labels";
import { Pill } from "@/components/ui/pill";
import type { PostStatus } from "@/lib/types";
import { aiReadiness } from "@/lib/ai";
import { AiBlocked } from "@/components/ui/ai-blocked";

// Lên lịch đăng một video đã duyệt: chọn kênh, giờ, caption. Kênh chưa có adapter hoặc chưa kết nối được ghi rõ lý do.
export function VideoScheduleForm({ videoId, back }: { videoId: string; back: string }) {
  const dry = isDryRun();
  const posts = videoPostsFor(videoId);
  // Bài đăng theo skill (6.1): bản nháp AI nếu có, không thì caption dựng theo skill viết content trong Second Brain
  const draft = captionDraft(videoId);
  const base = buildCaption(videoId);
  const caption = suggestCaption(videoId);
  const issues = captionIssues(caption, videoChannels().filter((c) => !c.blocked).map((c) => c.platform), scriptTextFor(videoId));
  const title = postTitle(videoId) ?? buildPostTitle(videoId);
  const draftSource = postDraftSource(videoId);
  const golden = goldenHours("facebook");
  const times = suggestPostTimes(golden.hours);
  const aiReady = aiReadiness("caption");
  const source = draft ? (draftSource?.startsWith("rule:") ? `Bản nháp theo luật — AI chưa viết được: ${draftSource.slice(5).trim()}` : "Tiêu đề + nội dung do AI Viết bài đăng viết (nháp)") : base.skill ? `Caption dựng theo skill “${base.skill.title}”${base.skill.status !== "ACTIVE" ? ` (${base.skill.status} — nháp)` : ""}` : "Kiến thức chưa có skill viết content — caption dựng theo cấu trúc mặc định";
  // Gọn (OWNER 25/10/2026 "ít chữ, tương tác bằng nút bấm"): kênh là nút bật/tắt (vẫn là checkbox name="platform"), caption trong ô,
  // lời giải thích dài chuyển vào chú thích khi rê chuột.
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {/* Tiêu đề "Lên lịch đăng" nằm ở khung chứa (Kho video) */}
        {dry ? <Pill tone="violet">Chế độ thử</Pill> : <Pill tone="jade">Đăng thật</Pill>}
        {posts.map((p) => (
          <Pill key={p.id} tone={postStatusLabel[p.status as PostStatus]?.tone ?? "neutral"}>{p.platform}: {postStatusLabel[p.status as PostStatus]?.label ?? p.status}</Pill>
        ))}
      </div>
      <form action={scheduleVideoAction} className="grid gap-2">
        <input type="hidden" name="id" value={videoId} />
        <input type="hidden" name="back" value={back} />
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Kênh đăng">
          {videoChannels().map((c) => {
            const st = channelStatus(c.platform);
            const usable = !c.blocked && (st.canPublish || dry);
            return (
              <label key={c.platform} title={usable ? st.reason : `${c.label}: ${c.blocked ? "chưa hỗ trợ" : "chưa kết nối"}${st.reason ? ` — ${st.reason}` : ""}`} className={usable ? "cursor-pointer" : "cursor-not-allowed"}>
                <input type="checkbox" name="platform" value={c.platform} disabled={!usable} defaultChecked={c.platform === "facebook" && usable} className="peer sr-only" />
                <span className="inline-flex h-7 items-center rounded-full border border-border-2 px-2.5 text-[12px] font-medium text-ink-2 transition-colors peer-checked:border-jade peer-checked:bg-jade peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-jade peer-disabled:border-dashed peer-disabled:text-ink-3 peer-disabled:opacity-60">
                  {c.label}
                </span>
              </label>
            );
          })}
        </div>
        <input name="title" defaultValue={title} maxLength={POST_TITLE_MAX} aria-label="Tiêu đề bài đăng" placeholder="Tiêu đề" className="h-8 w-full rounded-md border border-border-2 bg-surface px-2.5 text-[13px] font-semibold text-ink" />
        <textarea name="caption" rows={5} defaultValue={caption} aria-label="Nội dung bài đăng" title={source} className="w-full rounded-md border border-border-2 bg-surface px-2.5 py-1.5 text-[12.5px] text-ink" />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px]">
          <span className={draftSource?.startsWith("rule:") ? "text-amber" : "text-ink-3"} title={source}>{draft ? (draftSource?.startsWith("rule:") ? "Nháp theo luật" : "AI đã viết") : "Theo skill"}</span>
          {aiReady.ok ? (
            <button type="submit" formNoValidate formAction={aiCaptionAction} title={source} className="cursor-pointer font-semibold text-jade hover:underline">Viết lại bằng AI</button>
          ) : (
            <span className="inline-flex items-center gap-1.5"><button type="button" disabled title={aiReady.reason} className="cursor-not-allowed font-semibold text-ink-3">Viết lại bằng AI</button><AiBlocked ready={aiReady} /></span>
          )}
          {draft && <button type="submit" formNoValidate formAction={resetCaptionAction} className="cursor-pointer text-ink-3 hover:underline">Về bản theo skill</button>}
        </div>
        {issues.length > 0 && (
          <ul className="m-0 list-none p-0 text-[11.5px] text-brick">
            {issues.map((x, i) => <li key={i}>⚠ {x}</li>)}
          </ul>
        )}
        <div className="flex items-end gap-2">
          <WhenPicker suggestions={times} source={golden.source} />
          <Button type="submit" variant="primary" size="md" title="Ảnh bìa lấy tự động ở 20% thời lượng. Một video chỉ một bài mỗi kênh.">Lên lịch</Button>
        </div>
      </form>
    </div>
  );
}
