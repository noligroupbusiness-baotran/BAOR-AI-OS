import Link from "next/link";
import type { ReactNode } from "react";
import { PageHead } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Segment } from "@/components/ui/segment";
import { EmptyState } from "@/components/ui/empty-state";
import { Button, LinkButton } from "@/components/ui/button";
import { ActionMenu } from "@/components/ui/action-menu";
import { platformLabel } from "@/components/ui/platform";
import { ConfirmAction } from "@/components/campaigns/confirm-action";
import { VideoScheduleForm } from "@/components/publishing/video-schedule";
import { EmptyThumb, GridSizeToggle, VideoThumb } from "@/components/video/quick-view";
import { ScheduleDialog } from "@/components/video/schedule-dialog";
import { deleteVideoAction } from "@/lib/actions/videos";
import { aiCaptionAction } from "@/lib/actions/publishing";
import { SubmitButton } from "@/components/campaigns/submit-button";
import { AutoRefresh } from "@/components/video/auto-refresh";
import { captionDraft, postTitle } from "@/lib/publishing/caption";
import { postDraftPending } from "@/lib/publishing/post-draft";
import { fileUrl } from "@/lib/uploads";
import { libraryRows, purgeAfterHours, purgeEnabled, type LibraryRow } from "@/lib/videos/library";
import { listVideos } from "@/lib/videos/repository";
import { latestJob, videoDeleteBlock } from "@/lib/video/jobs";
import { can, currentActor } from "@/lib/permissions";
import { videoPostsFor } from "@/lib/publishing/video";
import { formatDateTime } from "@/lib/format";
import type { Platform } from "@/lib/types";

export const metadata = { title: "Tổng kho video ngắn – BAOR AI OS" };

// Bước 5 · Kho video (OWNER 25/10/2026: "trực quan và thực dụng hơn… thống nhất lại hành trình cho mượt hơn"):
// video đã duyệt ở bước 4 vào đây; mỗi thẻ ảnh xem trước (▶ xem ngay) + MỘT nút chính "Lên lịch đăng" (mở khung ngay trên trang)
// → lên lịch xong sang bước 6 · Đăng bài. Đã đăng / đã gỡ tệp giữ đúng logic tự gỡ tệp của src/lib/videos/library.ts.
type Tab = "unposted" | "scheduled" | "posted";
const tabs: { key: Tab; label: string }[] = [
  { key: "unposted", label: "Chưa đăng" },
  { key: "scheduled", label: "Đã lên lịch" },
  { key: "posted", label: "Đã đăng" },
];
// Bài còn chờ đăng (kể cả chế độ thử): đang chờ / đang đăng / đang xác minh
const PENDING = new Set(["scheduled", "publishing", "verifying"]);

const mmss = (s: number) => {
  const r = Math.max(0, Math.round(s));
  return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, "0")}`;
};

// Xoá (OWNER 25/10: "phải cho phép xoá video ở phần kho video"): dùng lại deleteVideoAction (chuyển vào data/removed, khôi phục được).
// Điều kiện ở videoDeleteBlock (dùng chung với bộ xoá): người có quyền phê duyệt; còn bài lên lịch → huỷ lịch trước; đã đăng thật → không xoá.

export default async function VideoLibraryPage({ searchParams }: { searchParams: Promise<{ tab?: string; schedule?: string; focus?: string }> }) {
  const sp = await searchParams;
  const status = new Map(listVideos().map((v) => [v.id, v]));
  const canDelete = can(await currentActor(), "manager");
  const rows = libraryRows().map((r) => {
    const posts = videoPostsFor(r.id);
    const pending = posts.filter((p) => PENDING.has(p.status)).sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
    const tab: Tab = r.state !== "unposted" ? "posted" : pending.length ? "scheduled" : "unposted";
    return { r, pending, tab };
  });
  const tab: Tab = sp.tab === "purged" ? "posted" : tabs.some((t) => t.key === sp.tab) ? (sp.tab as Tab) : "unposted";
  const list = rows.filter((x) => x.tab === tab);
  const count = (k: Tab) => rows.filter((x) => x.tab === k).length;
  const here = `/video-library?tab=${tab}`;
  const scheduling = sp.schedule ? rows.find((x) => x.r.id === sp.schedule) : undefined;
  // AI đang viết bài đăng cho video vừa duyệt → tự làm mới để hiện bản nháp khi xong
  const writing = rows.some((x) => postDraftPending(x.r.id));

  return (
    <>
      <AutoRefresh active={writing} everyMs={5000} />
      <PageHead title="Kho video" action={<LinkButton href="/video-studio?upload=1" variant="outline" size="md">Tải video đã edit</LinkButton>} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 max-w-full overflow-x-auto [&_a]:shrink-0 [&_a]:whitespace-nowrap">
          <Segment basePath="/video-library" active={tab} items={tabs.map((t) => ({ key: t.key, label: `${t.label} · ${count(t.key)}` }))} />
        </div>
        <div className="flex items-center gap-2">
          {list.length > 0 && <GridSizeToggle target="video-grid" />}
          <LinkButton href="/publishing#video-posts" variant="ghost">Đăng bài ›</LinkButton>
        </div>
      </div>
      {tab === "posted" && <p className="m-0 mt-2 text-[11.5px] text-ink-3">{purgeEnabled() ? `Đã đăng quá ${purgeAfterHours()} giờ thì tự gỡ tệp video (giữ bài, báo cáo).` : "Tự gỡ tệp đang tắt."}</p>}

      {list.length === 0 ? (
        <div className="card mt-3.5">
          <EmptyState
            title={tab === "unposted" ? "Kho chưa có video chờ đăng" : tab === "scheduled" ? "Chưa có video nào đã lên lịch" : "Chưa có video đã đăng"}
            hint={tab === "unposted" ? "Duyệt video ở bước 4 · Quay & edit video là video vào đây." : undefined}
            action={tab === "unposted" ? <LinkButton href="/video-studio" variant="soft">Tới Quay & edit video</LinkButton> : undefined}
          />
        </div>
      ) : (
        <ul id="video-grid" data-size="large" className="m-0 mt-3.5 grid list-none gap-3.5 p-0 sm:grid-cols-2 2xl:grid-cols-3 data-[size=small]:grid-cols-2 data-[size=small]:gap-2.5 sm:data-[size=small]:grid-cols-3 lg:data-[size=small]:grid-cols-4 2xl:data-[size=small]:grid-cols-5">
          {list.map(({ r, pending }) => (
            <LibraryCard key={r.id} r={r} pending={pending} here={here} known={status.has(r.id)} canDelete={canDelete} focus={sp.focus === r.id} />
          ))}
        </ul>
      )}

      {scheduling && (
        <ScheduleDialog title={`Lên lịch đăng · ${scheduling.r.title}`} closeHref={`/video-library?tab=${scheduling.tab}`}>
          {/* Lỗi / AI viết caption quay lại đúng khung này; lên lịch xong sang bước 6 · Đăng bài */}
          <VideoScheduleForm videoId={scheduling.r.id} back={`/video-library?tab=${scheduling.tab}&schedule=${encodeURIComponent(scheduling.r.id)}`} />
        </ScheduleDialog>
      )}
    </>
  );
}

function LibraryCard({ r, pending, here, known, canDelete, focus }: { r: LibraryRow; pending: ReturnType<typeof videoPostsFor>; here: string; known: boolean; canDelete: boolean; focus: boolean }) {
  const jv = latestJob(r.id);
  const report = jv?.job.status === "done" ? jv.report : null;
  const purged = !!r.filesPurgedAt;
  const preview = !purged && report && jv?.files.includes("preview.mp4") ? `/api/video-jobs/${r.id}/v${jv.job.version}/preview.mp4` : null;
  const src = purged ? null : (preview ?? (r.uploadId ? fileUrl(r.uploadId) : null));
  const aspect = report?.output.aspect ?? jv?.job.aspect;
  const studio = `/video-studio?open=${encodeURIComponent(r.id)}`;
  const scheduleHref = `${here}&schedule=${encodeURIComponent(r.id)}`;
  const firstLink = r.posts.find((p) => p.permalink)?.permalink ?? null;
  const block = known ? videoDeleteBlock(r.id, canDelete) : "Không tìm thấy video";
  const draft = captionDraft(r.id);
  const title = postTitle(r.id);
  const writing = postDraftPending(r.id);

  // Nút chính dẫn sang bước kế: chưa lên lịch → Lên lịch đăng; đã lên lịch → xem ở bước 6 · Đăng bài; đã đăng → xem bài trên nền tảng
  const primary: ReactNode = pending.length > 0 ? (
    <LinkButton href={`/publishing?video=${encodeURIComponent(r.id)}#video-posts`} variant="primary" size="md">Xem ở Đăng bài ›</LinkButton>
  ) : r.state === "unposted" ? (
    <LinkButton href={scheduleHref} variant="primary" size="md">Lên lịch đăng</LinkButton>
  ) : firstLink ? (
    <a href={firstLink} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center rounded-full border border-border-2 bg-surface px-3.5 text-[12.5px] font-medium text-ink hover:border-ink-3">Xem bài ›</a>
  ) : null;
  const badges = (
    <>
      {aspect && <span className="num pointer-events-none absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10.5px] font-semibold text-white/90">{aspect}{jv?.job.quality === "4k" ? " · 4K" : ""}</span>}
      {report && <span className="num pointer-events-none absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold text-white">{mmss(report.output.seconds)}</span>}
    </>
  );

  return (
    <li id={`v-${r.id}`} className={`card flex min-w-0 scroll-mt-24 flex-col ${focus ? "ring-2 ring-jade" : ""}`}>
      {src ? <VideoThumb src={src} title={r.title} detailHref={studio} cover={!!preview && aspect === "16:9"} action={primary} badges={badges} /> : <EmptyThumb badges={badges} />}
      <div className="flex flex-1 flex-col gap-2 p-3">
        <Link href={studio} className="line-clamp-2 text-[13.5px] font-semibold leading-snug text-ink hover:underline">{r.title}</Link>
        {/* Bài đăng (AI viết khi video vào Kho): tiêu đề + 2 dòng đầu — bấm để sửa trong khung Lên lịch đăng */}
        {writing ? (
          <p className="m-0 animate-pulse rounded-md bg-ground px-2.5 py-1.5 text-[12px] text-ink-3">AI đang viết tiêu đề + nội dung…</p>
        ) : draft ? (
          <Link href={scheduleHref} title="Bấm để sửa" className="block rounded-md bg-ground px-2.5 py-1.5 text-[12px] hover:bg-ground-2">
            {title && <span className="block truncate font-semibold text-ink">{title}</span>}
            <span className="line-clamp-2 whitespace-pre-line text-ink-2">{draft}</span>
          </Link>
        ) : null}
        <div className="flex flex-wrap items-center gap-1.5 text-[11.5px]">
          {r.state === "unposted" && pending.length === 0 && <Pill>Chưa lên lịch</Pill>}
          {pending.length > 0 && (
            <Pill tone={pending.some((p) => p.mode === "dry_run") ? "violet" : "sky"}>
              {pending.map((p) => platformLabel(p.platform as Platform)).join(", ")} · <span className="num">{formatDateTime(pending[0].scheduledFor)}</span>
              {pending.some((p) => p.mode === "dry_run") ? " · thử" : ""}
            </Pill>
          )}
          {r.posts.length > 0 && <Pill tone="jade">Đã đăng {r.posts.map((p) => platformLabel(p.platform as Platform)).join(", ")}{r.postedAt ? <> · <span className="num">{formatDateTime(r.postedAt)}</span></> : null}</Pill>}
          {r.purgeDueAt && <Pill tone="amber">gỡ tệp <span className="num">{formatDateTime(r.purgeDueAt)}</span></Pill>}
          {purged && <Pill>Đã gỡ tệp</Pill>}
          {r.origin === "self_edit" && <Pill tone="violet">Tự edit</Pill>}
        </div>
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          {primary ?? <span />}
          <ActionMenu>
            <LinkButton href={`${studio}&rename=1`} variant="ghost" className="justify-start">Đổi tên</LinkButton>
            {r.state === "unposted" && (
              <form action={aiCaptionAction} className="contents">
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="back" value={`${here}#v-${r.id}`} />
                <SubmitButton variant="ghost" pendingText="AI đang viết…" className="justify-start">Viết lại bằng AI</SubmitButton>
              </form>
            )}
            <LinkButton href={studio} variant="ghost" className="justify-start">Mở trong Studio</LinkButton>
            {pending.length > 0 && <LinkButton href={scheduleHref} variant="ghost" className="justify-start">Lên lịch thêm kênh</LinkButton>}
            {pending.length === 0 && r.posts.length > 0 && <LinkButton href={`/publishing?video=${encodeURIComponent(r.id)}#video-posts`} variant="ghost" className="justify-start">Xem ở Đăng bài</LinkButton>}
            {!purged && r.uploadId && <a href={fileUrl(r.uploadId)} download className="inline-flex h-[26px] items-center rounded-full px-2.5 text-[12px] font-medium text-ink-2 hover:bg-ground-2 hover:text-ink">Tải bản chính</a>}
            {block ? (
              <Button type="button" variant="ghost" disabled title={block} aria-label={`Xoá — ${block}`} className="justify-start">Xoá</Button>
            ) : (
              <span className="contents [&>button]:text-brick!">
                <ConfirmAction action={deleteVideoAction} fields={{ id: r.id, back: here }} label="Xoá" title={`Xoá video “${r.title}”?`} message="Gỡ video khỏi kho. Tệp gốc, các bản dựng, lịch sử và bài đăng đã huỷ được chuyển vào thư mục lưu trữ (data/removed), khôi phục được." confirmLabel="Xoá" variant="ghost" danger />
              </span>
            )}
          </ActionMenu>
        </div>
      </div>
    </li>
  );
}
