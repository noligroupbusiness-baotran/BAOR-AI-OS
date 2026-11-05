import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { SubmitButton } from "@/components/campaigns/submit-button";
import { ConfirmAction } from "@/components/campaigns/confirm-action";
import { WhenPicker } from "@/components/publishing/when-picker";
import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { autoPostAction, cancelVideoPostAction, postNowAction, rescheduleAction, scheduleAtAction, setAutoNewAction, setDryRunAction } from "@/lib/actions/publishing";
import { autoNewEnabled, platformSlots, type PlatformSlot } from "@/lib/publishing/auto-post";
import { captionDraft, postDraftSource, postTitle } from "@/lib/publishing/caption";
import { postDraftPending } from "@/lib/publishing/post-draft";
import { goldenHours, suggestPostTimes } from "@/lib/publishing/post-times";
import { isDryRun } from "@/lib/publishing/video";
import { libraryRows } from "@/lib/videos/library";
import { latestJob } from "@/lib/video/jobs";
import { fileUrl } from "@/lib/uploads";
import { cn, formatDateTime, formatNumber } from "@/lib/format";
import { approvedFolderState, lastApprovedIntake } from "@/lib/video/approved-intake";
import { workerKeyConfigured, workerOnline } from "@/lib/video/worker-auth";
import { approvedFolderText } from "@/app/(admin)/video-library/page";

// Bước 2 · Đăng (OWNER 05/11/2026, mẫu "thẻ nổi 3D, giữ màu BAOR"): mỗi video đã duyệt một hàng — ảnh video, bài GPT viết từ lời nói,
// MỖI NỀN TẢNG MỘT Ô: bấm "Đăng" là đăng ngay, "Hẹn giờ" chọn giờ cho nền tảng đó; đã hẹn → đổi giờ / huỷ; đã đăng → xem bài.
// Nút "✦ Tự động": GPT đọc video → viết bài → xếp giờ vàng cho mọi nền tảng còn mở. Công tắc đầu trang áp tự động cho video mới.
const BOARD = "/publishing";

function previewOf(videoId: string, uploadId: string | null, purged: boolean): string | null {
  const jv = latestJob(videoId);
  if (jv?.job.status === "done" && jv.files.includes("preview.mp4")) return `/api/video-jobs/${videoId}/v${jv.job.version}/preview.mp4`;
  return uploadId && !purged ? fileUrl(uploadId) : null;
}

function secondsOf(videoId: string): number | null {
  const jv = latestJob(videoId);
  return jv?.job.status === "done" ? (jv.report?.output.seconds ?? null) : null;
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

export function autoNewText(on: boolean, dry: boolean): string {
  if (!on) return "Video mới vào Kho: GPT viết bài, bạn bấm nền tảng để đăng.";
  return dry ? "Video mới vào Kho: GPT viết bài → tự xếp giờ vàng (chế độ thử, không đăng thật)." : "Video mới vào Kho: GPT viết bài → tự xếp giờ vàng → đăng thật.";
}

export function VideoBoard({ focus, owner }: { focus?: string; owner: boolean }) {
  const dry = isDryRun();
  const auto = autoNewEnabled();
  const rows = libraryRows().filter((r) => r.state === "unposted");
  const golden = goldenHours("facebook");
  const times = suggestPostTimes(golden.hours);
  // Thư mục VIDEO-DA-DUYET trên máy OWNER (máy dựng gửi lên Kho): nối thẳng vào bước Đăng
  const folder = approvedFolderText({ online: workerOnline(), hasKey: workerKeyConfigured(), state: approvedFolderState() });
  const last = lastApprovedIntake();
  return (
    <section id="video-board" className="flex flex-col gap-4">
      <div className="card flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="m-0 flex items-center gap-2 text-[13px] font-semibold text-ink">
            <span className={cn("inline-block h-2 w-2 rounded-full", folder.tone === "ok" ? "bg-jade" : folder.tone === "warn" ? "bg-amber" : "bg-border-2")} aria-hidden />
            Thư mục VIDEO-DA-DUYET trên máy
            <span className={cn("font-normal", folder.tone === "ok" ? "text-jade-ink" : folder.tone === "warn" ? "text-amber" : "text-ink-3")}>· {folder.text}{folder.tone === "ok" && last ? ` · nhận gần nhất ${formatDateTime(last.at)}` : ""}</span>
          </p>
          <p className="m-0 text-[12.5px] text-ink-2">{autoNewText(auto, dry)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ConfirmAction
            action={setDryRunAction}
            fields={{ on: dry ? "0" : "1" }}
            label={dry ? "Chế độ thử · BẬT" : "Đăng thật"}
            title={dry ? "Tắt chế độ thử?" : "Bật chế độ thử?"}
            message={dry ? (owner ? "Bài mới sẽ ĐĂNG THẬT lên kênh đã kết nối." : "Chỉ OWNER tắt được chế độ thử.") : "Bài mới sẽ không đăng thật."}
            confirmLabel={dry ? "Tắt chế độ thử" : "Bật chế độ thử"}
            variant={dry ? "soft" : "outline"}
          />
          <ConfirmAction
            action={setAutoNewAction}
            fields={{ on: auto ? "0" : "1", back: BOARD }}
            label={auto ? "✦ Tự động cho video mới · BẬT" : "✦ Tự động cho video mới"}
            title={auto ? "Tắt tự động?" : "Bật tự động cho video mới?"}
            message={auto ? "Video mới vào Kho sẽ chỉ có bài viết sẵn, bạn tự bấm đăng." : `Mỗi video mới vào Kho: GPT viết bài → xếp vào khung giờ vàng trống gần nhất${dry ? " (đang chế độ thử: không đăng thật)" : " → đăng thật lên kênh đã nối"}.${owner ? "" : " Chỉ quản trị bật / tắt được."}`}
            confirmLabel={auto ? "Tắt" : "Bật tự động"}
            variant={auto ? "primary" : "outline"}
          />
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card">
          <EmptyState title="Chưa có video chờ đăng" hint="Kéo video đã edit vào thư mục VIDEO-DA-DUYET trên máy, một phút sau video và bài viết hiện ở đây." action={<LinkButton href="/video-library" variant="soft">Kho video</LinkButton>} />
        </div>
      ) : (
        <ol className="m-0 flex list-none flex-col gap-4 p-0">
          {rows.map((r) => {
            const slots = platformSlots(r.id);
            const draft = captionDraft(r.id);
            const title = postTitle(r.id) ?? r.title;
            const writing = postDraftPending(r.id);
            const src = previewOf(r.id, r.uploadId, !!r.filesPurgedAt);
            const sec = secondsOf(r.id);
            const source = postDraftSource(r.id);
            const open = slots.some((s) => s.usable && !["scheduled", "publishing", "verifying", "published"].includes(s.state));
            const edit = `/video-library?tab=${slots.some((s) => s.state === "scheduled") ? "scheduled" : "unposted"}&schedule=${encodeURIComponent(r.id)}`;
            return (
              <li key={r.id} id={`b-${r.id}`} className={cn("card board3d flex scroll-mt-24 gap-5 p-5", focus === r.id && "ring-2 ring-jade")}>
                <div className="tilt3d relative grid h-[196px] w-[110px] shrink-0 place-items-center overflow-hidden rounded-[20px] bg-[#0f1a14]">
                  {src ? <video src={`${src}#t=1`} preload="metadata" muted playsInline aria-hidden className="pointer-events-none h-full w-full object-cover" /> : null}
                  {sec != null && <span className="num absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold text-white">{mmss(sec)}</span>}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="m-0 text-[17px] font-bold text-ink">{title}</h3>
                    {writing ? (
                      <span className="animate-pulse rounded-full bg-violet-soft px-2.5 py-0.5 text-[11.5px] font-semibold text-violet">GPT đang viết…</span>
                    ) : draft ? (
                      <span className={cn("rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold", source?.startsWith("rule:") ? "bg-amber-soft text-amber" : "bg-jade-soft text-jade-ink")} title={source?.startsWith("rule:") ? `Bài theo luật — AI chưa viết được: ${source.slice(5).trim()}` : "GPT viết từ lời đã nói trong video"}>
                        {source?.startsWith("rule:") ? "Bài theo luật" : "GPT viết từ lời nói"}
                      </span>
                    ) : (
                      <span className="rounded-full bg-ground-2 px-2.5 py-0.5 text-[11.5px] font-semibold text-ink-3">Chưa có bài</span>
                    )}
                    {r.origin === "self_edit" && <span className="rounded-full bg-ground-2 px-2.5 py-0.5 text-[11.5px] font-medium text-ink-2">Từ thư mục / tự edit</span>}
                  </div>
                  <p className="m-0 line-clamp-2 whitespace-pre-line text-[13.5px] leading-relaxed text-ink-2">{draft ?? (writing ? "Lời nói đã chuyển chữ, bài sẽ sẵn sàng trong ít phút." : "Bấm Sửa bài để viết, hoặc ✦ Tự động để GPT viết.")}</p>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {slots.map((s) => (
                      <SlotCard key={s.platform} videoId={r.id} slot={s} times={times} source={golden.source} dry={dry} writing={writing} />
                    ))}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col justify-center gap-2.5">
                  {open && !writing ? (
                    <form action={autoPostAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="back" value={`${BOARD}#b-${r.id}`} />
                      <SubmitButton variant="primary" size="md" pendingText="GPT đang viết…" className="h-12 w-full px-5 text-[14px]" title="GPT đọc video → viết bài → xếp mọi nền tảng còn mở vào giờ vàng trống gần nhất">✦ Tự động</SubmitButton>
                    </form>
                  ) : (
                    <span className="btn btn-primary h-12 w-full cursor-not-allowed px-5 text-[14px] opacity-50" aria-disabled title={writing ? "Chờ GPT viết bài xong" : "Không còn nền tảng nào để đăng"}>✦ Tự động</span>
                  )}
                  <LinkButton href={edit} variant="outline" size="md" className="justify-center">Sửa bài</LinkButton>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function SlotCard({ videoId, slot: s, times, source, dry, writing }: { videoId: string; slot: PlatformSlot; times: { value: string; label: string }[]; source: string; dry: boolean; writing: boolean }) {
  const back = `${BOARD}#b-${videoId}`;
  const p = s.post;
  const tone = s.state === "published" ? "card3d--ok" : s.state === "scheduled" || s.state === "publishing" || s.state === "verifying" ? "card3d--wait" : !s.usable ? "card3d--off" : "";
  const head = <div className="flex items-center gap-2 text-[13.5px] font-bold text-ink"><PlatformMark platform={s.platform} />{s.label.replace(/^Facebook Page$/, "Facebook").replace(" Reels", "").replace(" Shorts", "")}</div>;
  const pick = (label: string, action: (fd: FormData) => Promise<void>, fields: Record<string, string>, submit: string) => (
    // Khung chọn giờ mở NGAY TRONG ô (không nổi tuyệt đối: mỗi hàng có transform → hàng dưới sẽ che khung nổi)
    <details className="min-w-0 flex-1">
      <summary className="btn btn-glass inline-flex h-8 cursor-pointer list-none px-3 text-[12px] font-semibold [&::-webkit-details-marker]:hidden">{label}</summary>
      <form action={action} className="mt-2 grid gap-2 rounded-xl bg-surface p-2.5 ring-1 ring-border">
        {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <input type="hidden" name="back" value={back} />
        <WhenPicker suggestions={times} source={source} />
        <SubmitButton variant="primary" pendingText="Đang xếp…">{submit}</SubmitButton>
      </form>
    </details>
  );
  return (
    <div className={cn("card3d flex min-w-0 flex-col gap-2 p-3.5", tone)}>
      {head}
      {s.state === "published" && p ? (
        <>
          <div className="text-[12px] font-semibold text-jade-ink">Đã đăng{p.views != null ? <> · <span className="num">{formatNumber(p.views)}</span> xem</> : p.publishedAt ? <> · <span className="num">{formatDateTime(p.publishedAt)}</span></> : null}</div>
          {p.permalink ? <a href={p.permalink} target="_blank" rel="noreferrer" className="btn btn-glass h-8 w-fit px-3 text-[12px] font-semibold">Xem bài</a> : <span className="text-[12px] text-ink-3">Đang đọc lại bài</span>}
        </>
      ) : s.state === "scheduled" && p ? (
        <>
          <div className="text-[12px] font-semibold text-amber">Hẹn · <span className="num">{formatDateTime(p.scheduledFor)}</span>{p.mode === "dry_run" ? " · thử" : ""}</div>
          <div className="flex flex-wrap gap-1.5">
            {pick("Đổi giờ", rescheduleAction, { post: p.id }, "Đổi giờ")}
            <form action={cancelVideoPostAction}><input type="hidden" name="id" value={p.id} /><SubmitButton variant="ghost" pendingText="…" className="h-8 px-3 text-[12px]">Huỷ</SubmitButton></form>
          </div>
        </>
      ) : s.state === "publishing" || s.state === "verifying" ? (
        <div className="text-[12px] font-semibold text-amber">{s.state === "publishing" ? "Đang đăng…" : "Đang xác minh trên nền tảng…"}</div>
      ) : !s.usable ? (
        <>
          <div className="text-[12px] text-ink-3" title={s.reason}>{s.blocked ? "Chưa hỗ trợ" : "Chưa nối"}</div>
          <Link href="/settings#integrations" className="btn btn-glass h-8 w-fit px-3 text-[12px] font-semibold">Kết nối</Link>
        </>
      ) : (
        <>
          <div className="text-[12px] text-ink-3">
            {s.state === "failed" && p ? <span className="text-brick" title={p.error ?? ""}>Lỗi lần trước</span> : s.state === "overdue" ? <span className="text-amber">Quá hạn, xếp lại</span> : s.state === "dry_run" ? "Đã thử, chưa đăng thật" : "Chưa đăng"}
          </div>
          {writing ? (
            <span className="text-[12px] text-ink-3">Chờ GPT viết bài xong</span>
          ) : (
          <div className="flex flex-wrap gap-1.5">
            <form action={postNowAction}>
              <input type="hidden" name="id" value={videoId} />
              <input type="hidden" name="platform" value={s.platform} />
              <input type="hidden" name="back" value={back} />
              <SubmitButton variant="primary" pendingText="Đang xếp…" className="h-8 px-3 text-[12px]" title={dry ? "Chế độ thử: xếp ngay, không đăng thật" : `Đăng ngay lên ${s.label}`}>Đăng</SubmitButton>
            </form>
            {pick("Hẹn giờ", scheduleAtAction, { id: videoId, platform: s.platform }, "Hẹn")}
          </div>
          )}
        </>
      )}
    </div>
  );
}

function PlatformMark({ platform }: { platform: string }) {
  const p = platform.startsWith("facebook") ? "facebook" : platform;
  const bg = p === "facebook" ? "#1877f2" : p === "tiktok" ? "#111111" : p === "youtube" ? "#e53935" : p === "instagram" ? "#d6249f" : "#64748b";
  const ch = p === "facebook" ? "f" : p === "tiktok" ? "t" : p === "youtube" ? "▶" : p === "instagram" ? "◎" : "•";
  return <span aria-hidden className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-lg text-[11px] font-extrabold text-white" style={{ background: bg }}>{ch}</span>;
}

/** Số đếm đầu trang Đăng: video chờ, bài đã đăng tuần này, bài GPT đã viết. */
export function boardStats(now = Date.now()): { waiting: number; postedWeek: number; written: number } {
  const rows = libraryRows();
  const weekAgo = new Date(now - 7 * 86_400_000).toISOString();
  const posts = getDb().select({ status: schema.scheduledPosts.status, publishedAt: schema.scheduledPosts.publishedAt, mode: schema.scheduledPosts.mode }).from(schema.scheduledPosts).where(eq(schema.scheduledPosts.status, "published")).all();
  return {
    waiting: rows.filter((r) => r.state === "unposted").length,
    postedWeek: posts.filter((p) => p.mode === "live" && (p.publishedAt ?? "") >= weekAgo).length,
    written: rows.filter((r) => captionDraft(r.id) && !(postDraftSource(r.id) ?? "").startsWith("rule:")).length,
  };
}
