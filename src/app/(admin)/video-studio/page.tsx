import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ArrowLeft, Film, SlidersHorizontal } from "lucide-react";
import { PageHead, Panel, PanelHeader } from "@/components/ui/card";
import { Pill, type Tone } from "@/components/ui/pill";
import { Segment } from "@/components/ui/segment";
import { EmptyState } from "@/components/ui/empty-state";
import { ActionMenu } from "@/components/ui/action-menu";
import { MoreOptions } from "@/components/settings/setting-item";
import { ConfirmAction } from "@/components/campaigns/confirm-action";
import { CampaignContextBar } from "@/components/campaigns/campaign-context";
import { CampaignTags, LinkToCampaignForm } from "@/components/campaigns/entity-campaign";
import { campaignRepo, type EntityCampaignLink } from "@/lib/campaigns/repository";
import { readCampaignContext, withCampaignContext } from "@/lib/campaigns/context";
import { deleteVideoAction, linkVideoScriptAction, rerenderVideoAction, restorePrevPlanAction, stopVideoJobAction, transitionVideo } from "@/lib/actions/videos";
import { Button, LinkButton } from "@/components/ui/button";
import { SubmitButton } from "@/components/campaigns/submit-button";
import { SourceDrop } from "@/components/video/source-drop";
import { AutoRefresh } from "@/components/video/auto-refresh";
import { VideoPlayer } from "@/components/video/video-player";
import { FramingEditor } from "@/components/video/framing-editor";
import { PlanEditor } from "@/components/video/plan-editor";
import { EmptyThumb, GridSizeToggle, VideoThumb } from "@/components/video/quick-view";
import { RenameTitle } from "@/components/video/rename-title";
import { CompareVersions, ReviewWorkspace } from "@/components/video/review-workspace";
import { comparableVersions, listComments, verifyComments } from "@/lib/video/review";
import { listContent } from "@/lib/queries";
import { fileUrl } from "@/lib/uploads";
import { listVideos, type VideoRecord } from "@/lib/videos/repository";
import { brollLibrary, editSettings, jobVersions, latestJob, planBackups, readEditorPlan, readReport, type JobView } from "@/lib/video/jobs";
import { blockersForVideo } from "@/lib/video/approval";
import { qaLabel, qaTone } from "@/lib/video/job-types";
import { feedbackLabel, listVideoFeedback, type FeedbackKind } from "@/lib/video/feedback";
import { kindOf } from "@/lib/content/formats";
import { videoStatusLabel, type VideoStatus } from "@/lib/data/videos";
import { formatDateTime } from "@/lib/format";
import { can, currentActor } from "@/lib/permissions";

export const metadata = { title: "Video Studio – BAOR AI OS" };

// Quay & edit video (OWNER 25/10/2026: "giao diện đơn giản.. chuyên nghiệp ít chữ và tương tác bằng nút bấm"):
// danh sách = lưới thẻ, mỗi thẻ ảnh xem trước + MỘT nút chính theo trạng thái, thao tác phụ gom vào "⋯";
// mở một video (?open=) = 2 cột: trái xem / góp ý / biên tập, phải trạng thái + nút + kịch bản + chiến dịch + tệp + lịch sử.

const tabs: { key: VideoStatus | "all"; label: string }[] = [
  { key: "all", label: "Tất cả" },
  { key: "editing", label: "Đang dựng" },
  { key: "review", label: "Chờ kiểm tra" },
  { key: "needs_changes", label: "Cần chỉnh sửa" },
  { key: "pending_approval", label: "Chờ phê duyệt" },
];
// Video đã duyệt nằm ở bước 5 · Kho video (một hành trình, không hiện trùng ở hai nơi)
const LIBRARY = "/video-library";

const jobFile = (videoId: string, version: number, name: string) => `/api/video-jobs/${videoId}/v${version}/${name}`;

const mmss = (s: number) => {
  const r = Math.max(0, Math.round(s));
  return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, "0")}`;
};

/** Mọi thứ suy ra từ một video + lần dựng mới nhất — dùng chung cho thẻ và trang chi tiết. */
function facts(v: VideoRecord, jv: JobView | null, canApprove: boolean) {
  const running = !!jv && (jv.job.status === "queued" || jv.job.status === "running");
  const setup = jv?.job.status === "setup";
  const error = jv?.job.status === "error";
  const report = jv?.job.status === "done" ? jv.report : null;
  const hasPreview = !!report && !!jv?.files.includes("preview.mp4");
  const canRerender = !!jv && !running && !setup && (v.status === "review" || v.status === "needs_changes" || v.status === "editing" || error);
  // Người có quyền phê duyệt: MỘT nút "Duyệt" đi thẳng tới Kho (OWNER 25/10: "đạt rồi tại sao còn phải gửi duyệt")
  const primary: "setup" | "stop" | "rerender" | "send_review" | "send_approval" | "approve" | "wait" | "schedule" = setup
    ? "setup"
    : running
      ? "stop"
      : error && canRerender
        ? "rerender"
        : v.status === "editing"
          ? "send_review"
          : v.status === "needs_changes"
            ? canApprove && hasPreview
              ? "approve"
              : "send_review"
            : v.status === "review"
              ? canApprove
                ? "approve"
                : "send_approval"
              : v.status === "pending_approval"
                ? canApprove
                  ? "approve"
                  : "wait"
                : "schedule";
  // Một nhãn trạng thái duy nhất: tình trạng dựng đè lên trạng thái duyệt khi đang có việc dựng
  const state: { label: string; tone: Tone } = setup
    ? { label: "Chờ chọn khung", tone: "amber" }
    : running
      ? { label: jv!.job.status === "queued" ? "Chờ dựng" : "Đang dựng", tone: "sky" }
      : error
        ? { label: "Dựng lỗi", tone: "brick" }
        : videoStatusLabel[v.status];
  return { running, setup, error, report, hasPreview, canRerender, primary, state };
}

type Facts = ReturnType<typeof facts>;

/** Nút chính duy nhất theo trạng thái. */
function PrimaryAction({ v, f, back, openHref, size = "md", wide }: { v: VideoRecord; f: Facts; back: string; openHref: string; size?: "sm" | "md"; wide?: boolean }) {
  const w = wide ? "w-full" : undefined;
  switch (f.primary) {
    case "setup":
      return <LinkButton href={openHref} variant="primary" size={size} className={w}>Chọn khung & dựng</LinkButton>;
    case "stop":
      return <ConfirmAction action={stopVideoJobAction} fields={{ id: v.id, back }} label="Dừng" title="Dừng bản đang dựng?" message="Bản đang dựng bị huỷ; các bản trước vẫn giữ. Có thể dựng lại sau." confirmLabel="Dừng" size={size} />;
    case "rerender":
      return <ConfirmAction action={rerenderVideoAction} fields={{ id: v.id, back }} label="Dựng lại" title="Dựng lại từ video gốc?" message="Tạo bản mới, bản cũ vẫn giữ. Dùng lại lời đã nghe nếu có." confirmLabel="Dựng lại" variant="primary" size={size} />;
    case "send_review":
      return <ConfirmAction action={transitionVideo} fields={{ id: v.id, kind: "send_review", back }} label="Gửi kiểm tra" title="Chuyển video sang chờ kiểm tra?" message="Dùng khi bản dựng đã xong và bạn muốn xem bản này." confirmLabel="Gửi kiểm tra" variant="primary" size={size} />;
    case "send_approval":
      return <ConfirmAction action={transitionVideo} fields={{ id: v.id, kind: "send_approval", back }} label="Gửi duyệt" title="Gửi video đi phê duyệt?" message="Video sẽ hiện ở Chờ phê duyệt của chiến dịch đã gắn." confirmLabel="Gửi duyệt" variant="primary" size={size} />;
    case "wait":
      return <Button type="button" variant="outline" size={size} disabled className={w} title="Chờ người có quyền phê duyệt">Chờ duyệt</Button>;
    case "approve": {
      const blockers = blockersForVideo(v);
      return (
        <ConfirmAction
          action={transitionVideo}
          // Duyệt xong: sang Kho video, mở sẵn khung Lên lịch đăng
          fields={{ id: v.id, kind: "approve_direct", back: `${LIBRARY}?schedule=${encodeURIComponent(v.id)}`, fail: back }}
          label="Duyệt"
          title="Duyệt video này?"
          message={blockers.length ? `Còn ${blockers.length} điểm chặn đăng: ${blockers.join("; ")}. Ghi rõ đã xử lý thế nào.` : "Video vào Kho video để lên lịch đăng. Không tự động đăng."}
          confirmLabel="Duyệt"
          variant="primary"
          size={size}
          withNote={blockers.length ? { label: "Cách xử lý điểm chặn đăng", required: true, minLength: 10, placeholder: "VD: Đã mua giấy phép font; logo giữ cỡ 420; đã nghe lại các từ chưa chắc" } : { label: "Ghi chú (tùy chọn)" }}
        />
      );
    }
    case "schedule":
      return <LinkButton href={`${LIBRARY}?schedule=${encodeURIComponent(v.id)}`} variant="primary" size={size} className={w}>Lên lịch đăng</LinkButton>;
  }
}

/** Thao tác phụ (giữ nguyên điều kiện cũ của từng nút).
 *  Thẻ: tất cả vào "⋯" (chỉ việc hay dùng: Đổi tên, Dựng lại, Yêu cầu chỉnh sửa, Gắn chiến dịch, Xem bài, Xoá).
 *  Trang chi tiết: lộ Dựng lại · Khung hình · Yêu cầu chỉnh sửa; việc hiếm dùng (AI biên tập lại, cắt lặng, Xem bài, Xoá…) vào "⋯". */
function SecondaryActions({ v, jv, f, back, listBack, openHref, detail, prevPlans = 0 }: { v: VideoRecord; jv: JobView | null; f: Facts; back: string; listBack: string; openHref: string; detail?: boolean; prevPlans?: number }) {
  const main: ReactNode[] = [];
  const more: ReactNode[] = [];
  const shown = detail ? main : more;
  const item = (key: string, node: ReactNode, where: ReactNode[]) => where.push(<span key={key} className="contents">{node}</span>);
  const mv = detail ? "outline" : "ghost";
  if (!detail) item("rename", <LinkButton href={`${openHref}&rename=1`} variant="ghost" className="justify-start">Đổi tên</LinkButton>, more);
  if (!f.running && !f.setup && (v.status === "editing" || v.status === "needs_changes") && f.primary !== "send_review")
    item("send", <ConfirmAction action={transitionVideo} fields={{ id: v.id, kind: "send_review", back }} label="Gửi kiểm tra" title="Chuyển video sang chờ kiểm tra?" message="Dùng khi bản dựng đã xong và bạn muốn xem bản này." confirmLabel="Gửi kiểm tra" variant="ghost" />, more);
  if (f.canRerender && jv && f.primary !== "rerender")
    item("rr", <ConfirmAction action={rerenderVideoAction} fields={{ id: v.id, back }} label="Dựng lại" title="Dựng lại từ video gốc?" message="Tạo bản mới, bản cũ vẫn giữ. Dùng lại lời đã nghe nếu có." confirmLabel="Dựng lại" variant={mv} />, shown);
  if (f.canRerender && jv && detail)
    item("frame", <FramingEditor videoId={v.id} back={back} sourceUrl={fileUrl(jv.job.sourceUploadId)} aspect={jv.job.aspect ?? "9:16"} fx={jv.job.framing?.x} fy={jv.job.framing?.y} fz={jv.job.framing?.zoom} />, main);
  if (v.status === "review" || v.status === "pending_approval")
    item("req", <ConfirmAction action={transitionVideo} fields={{ id: v.id, kind: "request_changes", back }} label="Yêu cầu chỉnh sửa" title="Yêu cầu chỉnh sửa?" message="Ghi chú được lưu vào lịch sử phản hồi. Chỉnh thông số rồi bấm Dựng lại, hoặc tải bản sửa tay lên." confirmLabel="Gửi yêu cầu" withNote={{ label: "Điều cần sửa", required: true, placeholder: "VD: Cắt khoảng lặng, đổi nhạc nhẹ hơn" }} variant={mv} />, shown);
  if (f.canRerender && jv && detail) {
    item("ai", <ConfirmAction action={rerenderVideoAction} fields={{ id: v.id, back, ai: "1" }} label="AI biên tập lại" title="Để biên tập AI lập lại kế hoạch?" message="Mô hình ngôn ngữ chạy tại máy đọc lời nói, chọn chữ nhấn / sơ đồ / ảnh minh hoạ theo Skill ESV; luật kiểm nguyên văn và mật độ loại mục sai. Kế hoạch hiện tại được lưu trữ, không xoá. Tạo bản mới, bản cũ vẫn giữ." confirmLabel="AI biên tập" variant="ghost" />, more);
    // Kế hoạch cũ được cất (plan.prev-*) khi AI lập lại kế hoạch: chỉ hiện khi có bản cất
    if (prevPlans > 0) item("restore", <ConfirmAction action={restorePrevPlanAction} fields={{ id: v.id, back }} label="Khôi phục kế hoạch AI trước" title="Khôi phục kế hoạch trước rồi dựng lại?" message={`Dùng lại kế hoạch biên tập đã cất gần nhất (${prevPlans} bản cất). Kế hoạch đang dùng được cất lại, không xoá. Tạo bản mới, bản cũ vẫn giữ.`} confirmLabel="Khôi phục và dựng" variant="ghost" />, more);
    if (!jv.job.cutSilence) item("cut", <ConfirmAction action={rerenderVideoAction} fields={{ id: v.id, back, cut: "1" }} label="Dựng lại, cắt lặng" title="Dựng lại và cắt khoảng lặng?" message="Cắt các khoảng lặng ≥ 0,28 s (chừa 90 ms mỗi bên); chữ nhấn, sơ đồ, minh hoạ tự dời theo bản đã cắt." confirmLabel="Dựng lại" variant="ghost" />, more);
  }
  if (!detail) item("camp", <LinkButton href={`${openHref}&link=${encodeURIComponent(v.id)}`} variant="ghost" className="justify-start">Gắn chiến dịch</LinkButton>, more);
  if (v.status === "approved") item("posts", <LinkButton href={`/publishing?video=${encodeURIComponent(v.id)}#video-posts`} variant="ghost" className="justify-start">Xem ở Đăng bài</LinkButton>, more);
  if (f.setup || f.running || f.canRerender)
    // Nút Xoá màu đỏ (ConfirmAction ghép lớp không gộp, nên đặt màu ở lớp bọc `contents`)
    more.push(
      <span key="del" className="contents [&>button]:text-brick! [&>button:hover]:bg-brick-soft!">
        <ConfirmAction
          action={deleteVideoAction}
          fields={{ id: v.id, back: listBack }}
          label="Xoá video"
          title={`Xoá video “${v.title}”?`}
          message={f.setup ? "Gỡ video khỏi Video Studio. Tệp gốc được chuyển vào thư mục lưu trữ (data/removed), khôi phục được." : f.running ? "Dừng dựng và gỡ video khỏi Video Studio. Tệp gốc, các bản dựng và lịch sử được chuyển vào thư mục lưu trữ (data/removed), khôi phục được." : "Gỡ video khỏi Video Studio. Tệp gốc, các bản dựng và lịch sử được chuyển vào thư mục lưu trữ (data/removed), khôi phục được."}
          confirmLabel="Xoá"
          variant="ghost"
          danger
        />
      </span>,
    );
  if (!main.length && !more.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {main}
      {more.length > 0 && <ActionMenu align={detail ? "left" : "right"}>{more}</ActionMenu>}
    </div>
  );
}

function Progress({ jv }: { jv: JobView }) {
  const pct = jv.progress?.pct ?? 0;
  return (
    <div>
      <div className="flex justify-between gap-2 text-[11.5px] text-ink-2">
        <span className="truncate">{jv.job.status === "queued" ? "Chờ tới lượt dựng" : (jv.progress?.label ?? "Đang dựng")}</span>
        <span className="num">{pct}%</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ground-2"><div className="h-full rounded-full bg-jade transition-[width]" style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

/** Thẻ một video trong lưới. */
function VideoCard({ v, jv, back, openHref, canApprove }: { v: VideoRecord; jv: JobView | null; back: string; openHref: string; canApprove: boolean }) {
  const f = facts(v, jv, canApprove);
  const aspect = jv?.job.aspect ?? "9:16";
  const src = f.hasPreview ? jobFile(v.id, jv!.job.version, "preview.mp4") : v.uploadId ? fileUrl(v.uploadId) : jv?.job.sourceUploadId ? fileUrl(jv.job.sourceUploadId) : null;
  const badges = (
    <>
      {jv && <span className="num pointer-events-none absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10.5px] font-semibold text-white/90">{aspect}{jv.job.quality === "4k" ? " · 4K" : ""}</span>}
      {f.report && <span className="num pointer-events-none absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold text-white">{mmss(f.report.output.seconds)}</span>}
    </>
  );
  return (
    <li className="card flex min-w-0 flex-col">
      {src ? (
        <VideoThumb src={src} title={v.title} detailHref={openHref} cover={f.hasPreview && aspect === "16:9"} action={<PrimaryAction v={v} f={f} back={back} openHref={openHref} />} badges={badges} />
      ) : (
        <EmptyThumb badges={badges} />
      )}
      <div className="flex flex-1 flex-col gap-2 p-3">
        <Link href={openHref} className="line-clamp-2 text-[13.5px] font-semibold leading-snug text-ink hover:underline">{v.title}</Link>
        <div className="flex items-center gap-1.5">
          <Pill tone={f.state.tone}>{f.state.label}</Pill>
          <span className="num text-[11.5px] text-ink-3">Bản {v.version}</span>
        </div>
        {f.running && jv && <Progress jv={jv} />}
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <PrimaryAction v={v} f={f} back={back} openHref={openHref} />
          <SecondaryActions v={v} jv={jv} f={f} back={back} listBack={back} openHref={openHref} />
        </div>
      </div>
    </li>
  );
}

/** Khối trong cột phải. */
function Side({ title, children, id }: { title?: string; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="scroll-mt-20 border-t border-border px-4 py-3 first:border-t-0">
      {title && <h3 className="lbl mb-1.5 text-ink-3">{title}</h3>}
      {children}
    </section>
  );
}

export default async function VideoStudioPage({ searchParams }: { searchParams: Promise<{ tab?: string; campaign?: string; goal?: string; link?: string; upload?: string; content?: string; open?: string; filter?: string; rename?: string }> }) {
  const sp = await searchParams;
  // Tab "Đã phê duyệt" đã bỏ — video đã duyệt nằm ở Kho video. Liên kết cũ chuyển sang Kho (mở chi tiết một video thì vẫn mở tại đây).
  if (sp.tab === "approved" && !sp.open) redirect(LIBRARY);
  const scripts = listContent().filter((c) => kindOf(c.format) === "script" && (c.status === "approved" || c.status === "scheduled" || c.status === "published"));
  const tab = tabs.some((t) => t.key === sp.tab) ? (sp.tab as VideoStatus | "all") : "all";
  const ctx = readCampaignContext(sp);
  const campaign = ctx.campaignId ? campaignRepo.get(ctx.campaignId) : undefined;
  const linkedIds = campaign ? new Set(campaignRepo.links(campaign.id, ctx.channelGoalId).filter((l) => l.entityType === "video").map((l) => l.entityId)) : null;
  const everything = listVideos();
  const all = everything.filter((v) => v.status !== "approved" && (linkedIds ? linkedIds.has(v.id) : true));
  const approvedCount = everything.filter((v) => v.status === "approved" && (linkedIds ? linkedIds.has(v.id) : true)).length;
  const canApprove = can(await currentActor(), "manager");
  const list = tab === "all" ? all : all.filter((v) => v.status === tab);
  const back = withCampaignContext(`/video-studio?tab=${tab}`, ctx);
  const openHrefOf = (id: string) => withCampaignContext(`/video-studio?tab=${tab}&open=${id}`, ctx);
  const count = (s: VideoStatus) => all.filter((v) => v.status === s).length;
  const open = sp.open ? everything.find((v) => v.id === sp.open) : undefined;
  const jobs = new Map((open ? [open] : list).map((v) => [v.id, latestJob(v.id)]));
  const busy = [...jobs.values()].some((j) => j && (j.job.status === "queued" || j.job.status === "running"));

  const upload = sp.upload === "1" && (
    <Panel>
      <PanelHeader title="Thêm video gốc" sub="Tối đa 8 GB mỗi tệp. Xong là tự xếp hàng dựng." action={<LinkButton href={withCampaignContext("/video-studio", ctx)} variant="ghost">Đóng</LinkButton>} />
      <SourceDrop scripts={scripts.map((c) => ({ id: c.id, title: c.title }))} defaultContentId={sp.content ?? ""} defaultCut={editSettings().cutSilence} />
    </Panel>
  );

  if (open) {
    const links = campaignRepo.linksForEntities("video", [open.id]);
    return (
      <>
        <AutoRefresh active={busy} />
        {upload}
        <VideoDetail v={open} jv={jobs.get(open.id) ?? null} back={back} openHref={openHrefOf(open.id)} vLinks={links.get(open.id)} linkOpen={sp.link === open.id} renameOpen={sp.rename === "1"} scripts={scripts} canApprove={canApprove} />
      </>
    );
  }

  const filterOpen = sp.filter === "1";
  const filterHref = withCampaignContext(`/video-studio?tab=${tab}${filterOpen ? "" : "&filter=1"}`, ctx);

  return (
    <>
      <AutoRefresh active={busy} />
      <PageHead title="Quay & edit video" action={sp.upload === "1" ? undefined : <LinkButton href={withCampaignContext("/video-studio?upload=1", ctx)} variant="primary" size="md">Thêm video gốc</LinkButton>} />
      {upload}
      {(ctx.campaignId || filterOpen) && <CampaignContextBar ctx={ctx} pathname="/video-studio" params={{ tab }} note={linkedIds ? "chỉ hiện video của chiến dịch" : undefined} />}

      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 max-w-full overflow-x-auto [&_a]:shrink-0 [&_a]:whitespace-nowrap">
          <Segment basePath={withCampaignContext("/video-studio", ctx)} active={tab} items={tabs.map((t) => ({ key: t.key, label: t.key === "all" ? `${t.label} · ${all.length}` : `${t.label} · ${count(t.key as VideoStatus)}` }))} />
        </div>
        <div className="flex items-center gap-2">
          {!ctx.campaignId && (
            <LinkButton href={filterHref} variant={filterOpen ? "soft" : "ghost"}>
              <SlidersHorizontal size={13} aria-hidden />
              {filterOpen ? "Đóng lọc" : "Lọc theo chiến dịch"}
            </LinkButton>
          )}
          {list.length > 0 && <GridSizeToggle target="video-grid" />}
          <LinkButton href={LIBRARY} variant="ghost">Kho video{approvedCount ? ` · ${approvedCount}` : ""} ›</LinkButton>
        </div>
      </div>

      {list.length === 0 ? (
        <div className="card mt-3.5">
          <EmptyState title={linkedIds ? "Chiến dịch này chưa có video" : "Chưa có video ở mục này"} hint="Quay theo kịch bản đã duyệt rồi bấm “Thêm video gốc”." />
        </div>
      ) : (
        <ul id="video-grid" data-size="large" className="m-0 mt-3.5 grid list-none gap-3.5 p-0 sm:grid-cols-2 2xl:grid-cols-3 data-[size=small]:grid-cols-2 data-[size=small]:gap-2.5 sm:data-[size=small]:grid-cols-3 lg:data-[size=small]:grid-cols-4 2xl:data-[size=small]:grid-cols-5">
          {list.map((v) => (
            <VideoCard key={v.id} v={v} jv={jobs.get(v.id) ?? null} back={back} openHref={openHrefOf(v.id)} canApprove={canApprove} />
          ))}
        </ul>
      )}
    </>
  );
}

function VideoDetail({ v, jv, back, openHref, vLinks, linkOpen, renameOpen, scripts, canApprove }: { v: VideoRecord; jv: JobView | null; back: string; openHref: string; vLinks?: EntityCampaignLink[]; linkOpen: boolean; renameOpen: boolean; scripts: { id: string; title: string }[]; canApprove: boolean }) {
  const f = facts(v, jv, canApprove);
  const { report, hasPreview } = f;
  // Video Review: kiểm góp ý đang chờ bản mới (lặp an toàn; bộ dựng cũng gọi khi xong), rồi đọc danh sách
  try {
    verifyComments(v.id);
  } catch (e) {
    console.error(`[BAOR] Kiểm góp ý video ${v.id} lỗi:`, e);
  }
  const comments = listComments(v.id);
  const compare = comparableVersions(v.id);
  const feedback = listVideoFeedback(v.id);
  const versions = jobVersions(v.id);
  // Bản mới đang dựng / lỗi: góp ý vẫn xem được trên bản đã dựng xong gần nhất (kết quả kiểm "chưa áp dụng" phải thấy được)
  const reviewVersion = hasPreview ? jv!.job.version : (compare[0] ?? null);
  const reviewReport = reviewVersion !== null && !hasPreview ? readReport(v.id, reviewVersion) : report;
  const planned = comments.filter((c) => c.status === "planned").length;
  // Ảnh / clip dùng được (có giấy phép, có tệp) cho bảng biên tập
  const planImages = brollLibrary()
    .filter((b) => b.exists && b.license.trim())
    .map((b) => ({ file: b.file, label: `${b.file.replace(/^anh\//, "").replace(/\.[a-z0-9]+$/i, "")}${b.keywords.length ? ` (${b.keywords.slice(0, 2).join(", ")})` : ""}` }));
  const fixes = report?.transcript?.script ? (report.transcript.scriptFixes?.filter((x) => x.from !== x.to).length ?? 0) : null;
  const fileLinks: { href: string; label: string; blank?: boolean }[] = jv
    ? [
        ...(jv.files.includes("contact.jpg") ? [{ href: jobFile(v.id, jv.job.version, "contact.jpg"), label: "Ảnh mốc", blank: true }] : []),
        ...(jv.files.includes("compare.jpg") ? [{ href: jobFile(v.id, jv.job.version, "compare.jpg"), label: "So gốc và bản dựng", blank: true }] : []),
        ...(jv.files.includes("phu-de.srt") ? [{ href: jobFile(v.id, jv.job.version, "phu-de.srt"), label: "Phụ đề .srt" }] : []),
        ...(jv.files.includes("transcript.txt") ? [{ href: jobFile(v.id, jv.job.version, "transcript.txt"), label: "Lời đã nghe", blank: true }] : []),
        ...(jv.files.includes("report.json") ? [{ href: jobFile(v.id, jv.job.version, "report.json"), label: "Báo cáo đầy đủ", blank: true }] : []),
      ]
    : [];
  if (v.uploadId) fileLinks.push({ href: fileUrl(v.uploadId), label: "Tải bản chính" });
  const recent = feedback.slice(0, 3);
  const older = feedback.slice(3);
  // Một dòng mỗi mục: loại · ghi chú (cắt gọn) · giờ; bấm mở ra đủ ghi chú + bản + người làm. Ghi chú chỉ có MỘT bản trong DOM.
  const feedbackItem = (x: (typeof feedback)[number]) => (
    <li key={x.id} className="min-w-0">
      <details className="group/fb rounded-md bg-ground">
        <summary className="flex cursor-pointer list-none items-baseline gap-1.5 px-2.5 py-1.5 text-[12px] [&::-webkit-details-marker]:hidden">
          <span className="shrink-0 font-semibold text-ink">{feedbackLabel[x.kind as FeedbackKind] ?? x.kind}</span>
          <span className="min-w-0 flex-1 truncate text-ink-2 group-open/fb:overflow-visible group-open/fb:whitespace-pre-line">{x.note}</span>
          <span className="num shrink-0 text-[11px] text-ink-3">{formatDateTime(x.at)}</span>
        </summary>
        <div className="num px-2.5 pb-1.5 text-[11px] text-ink-3">Bản {x.version} · {x.by}</div>
      </details>
    </li>
  );

  return (
    <>
      <Link href={back} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-ink-2 hover:text-ink">
        <ArrowLeft size={14} aria-hidden /> Tất cả video
      </Link>
      {/* Desktop: trái = xem / góp ý / biên tập (2 hàng), phải = đầu (tên + nút) rồi thông tin. Màn hẹp: đầu → trình xem → thông tin. */}
      <div className="mt-3 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:grid-rows-[auto_1fr]">
        <div className="grid min-w-0 gap-3 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <div className="card min-w-0 p-3">
            {f.setup && jv ? (
              <FramingEditor mode="start" videoId={v.id} back={openHref} sourceUrl={fileUrl(jv.job.sourceUploadId)} aspect={jv.job.aspect ?? "9:16"} fx={jv.job.framing?.x} fy={jv.job.framing?.y} fz={jv.job.framing?.zoom} cut={jv.job.cutSilence} />
            ) : reviewVersion !== null && (hasPreview || comments.length > 0 || f.error) ? (
              <ReviewWorkspace
                videoId={v.id}
                version={reviewVersion}
                back={openHref}
                src={jobFile(v.id, reviewVersion, "preview.mp4")}
                hdSrc={hasPreview && v.uploadId ? fileUrl(v.uploadId) : undefined}
                plan={readEditorPlan(v.id).plan}
                keep={reviewReport?.output.keep ?? null}
                comments={comments}
                canApply={f.canRerender}
                aspect={reviewReport?.output.aspect ?? jv?.job.aspect}
              />
            ) : hasPreview ? (
              <VideoPlayer src={jobFile(v.id, jv!.job.version, "preview.mp4")} hdSrc={v.uploadId ? fileUrl(v.uploadId) : undefined} aspect={jv!.job.aspect} />
            ) : v.uploadId ? (
              <VideoPlayer src={fileUrl(v.uploadId)} />
            ) : (
              <div className="grid aspect-video place-items-center rounded-md bg-black text-white/40"><Film size={32} aria-hidden /></div>
            )}
            {!hasPreview && planned > 0 && <p className="m-0 mt-2 text-[12px] text-ink-2">{planned} góp ý đang chờ bản dựng mới (đang xem bản {reviewVersion}); kết quả kiểm hiện khi dựng xong.</p>}
          </div>
          {compare.length >= 2 && <CompareVersions videoId={v.id} versions={compare} />}
          {jv && !f.running && !f.setup && <div><PlanEditor videoId={v.id} back={openHref} plan={readEditorPlan(v.id).plan} keep={report?.output.keep ?? null} images={planImages} canRerender={f.canRerender} /></div>}
          {report && report.blockers.length > 0 && (
            <div className="rounded-md border border-amber/40 bg-amber-soft px-3 py-2 text-[12.5px]">
              <div className="font-semibold text-amber">Điểm chặn đăng · {report.blockers.length}</div>
              <ul className="m-0 mt-1 list-disc pl-4 text-ink">{report.blockers.map((b) => <li key={b}>{b}</li>)}</ul>
            </div>
          )}
          {report && (
            <div className="card px-4 py-3">
              <MoreOptions label={report.failed.length ? `Bảng kiểm · Chưa đạt ${report.failed.join(", ")}` : "Bảng kiểm · Đạt"}>
                <div className="overflow-x-auto rounded-md border border-border">
                  <table className="w-full min-w-[520px] border-collapse text-[12px]">
                    <thead><tr className="bg-ground-2 text-left text-ink-2"><th className="px-2.5 py-1.5 font-medium">Mục</th><th className="px-2.5 py-1.5 font-medium">Kiểm</th><th className="px-2.5 py-1.5 font-medium">Kết quả</th><th className="px-2.5 py-1.5 font-medium">Chi tiết</th></tr></thead>
                    <tbody>
                      {report.qa.map((q) => (
                        <tr key={q.id} className="border-t border-border align-top">
                          <td className="num px-2.5 py-1.5 font-semibold text-ink">{q.id}</td>
                          <td className="px-2.5 py-1.5 text-ink">{q.name}</td>
                          <td className="px-2.5 py-1.5"><Pill tone={qaTone[q.status]}>{qaLabel[q.status]}</Pill></td>
                          <td className="px-2.5 py-1.5 text-ink-2">{q.detail}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </MoreOptions>
            </div>
          )}
        </div>

        {/* Cột phải: trạng thái + nút + thông tin */}
        <section aria-label="Trạng thái và thao tác" className="card order-first min-w-0 lg:order-none lg:col-start-2 lg:row-start-1">
          <Side>
            <RenameTitle id={v.id} title={v.title} back={openHref} initialOpen={renameOpen} />
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Pill tone={f.state.tone}>{f.state.label}</Pill>
              <Pill className="num">Bản {v.version}</Pill>
              {report && <Pill className="num">{mmss(report.output.seconds)}</Pill>}
              {jv?.job.aspect && <Pill className="num">{jv.job.aspect}</Pill>}
              {jv?.job.quality === "4k" && <Pill tone="violet">4K</Pill>}
              {report && <Pill tone={report.failed.length ? "brick" : "jade"}>{report.failed.length ? `Chưa đạt ${report.failed.join(", ")}` : "Bảng kiểm đạt"}</Pill>}
              {report && report.blockers.length > 0 && <Pill tone="amber">{report.blockers.length} điểm chặn</Pill>}
            </div>
            {f.error && jv?.job.error && <p className="m-0 mt-2 text-[12px] text-brick">{jv.job.error}</p>}
            {f.running && jv && <div className="mt-3"><Progress jv={jv} /></div>}
            {f.primary !== "setup" && (
              <div className="mt-3 grid [&>button]:w-full">
                <PrimaryAction v={v} f={f} back={openHref} openHref={openHref} wide />
              </div>
            )}
            <div className="mt-2.5">
              <SecondaryActions v={v} jv={jv} f={f} back={openHref} listBack={back} openHref={openHref} detail prevPlans={planBackups(v.id).length} />
            </div>
          </Side>
        </section>

        <aside className="card min-w-0 lg:col-start-2 lg:row-start-2">
          {/* Kịch bản + Chiến dịch: mỗi thứ một dòng (nhãn · giá trị · nút đổi mở ra) */}
          <Side>
            <details className="group/row">
              <summary className="flex cursor-pointer list-none items-center gap-2 text-[12.5px] [&::-webkit-details-marker]:hidden">
                <span className="w-[68px] shrink-0 text-[11.5px] text-ink-3">Kịch bản</span>
                <span className="min-w-0 flex-1 truncate">
                  {v.contentId ? <Link href={`/content?tab=done&open=${v.contentId}`} className="font-medium text-jade hover:underline">{v.contentTitle ?? v.contentId}</Link> : <span className="text-ink-3">chưa gắn kịch bản</span>}
                  {fixes !== null && <span className="text-ink-3"> · sửa {fixes} từ</span>}
                </span>
                <span className="shrink-0 text-[12px] font-medium text-jade group-open/row:hidden">Đổi<span className="sr-only"> kịch bản</span></span>
                <span className="hidden shrink-0 text-[12px] font-medium text-ink-3 group-open/row:inline">Đóng</span>
              </summary>
              <form action={linkVideoScriptAction} className="mt-2 flex items-center gap-1.5 text-[12px]" aria-label="Gắn kịch bản">
                <input type="hidden" name="id" value={v.id} />
                <input type="hidden" name="back" value={openHref} />
                <select name="contentId" defaultValue={v.contentId ?? ""} aria-label="Kịch bản đã duyệt" className="h-[26px] min-w-0 flex-1 rounded-md border border-border-2 bg-surface px-1.5 text-ink">
                  <option value="">Không gắn kịch bản</option>
                  {scripts.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
                <SubmitButton variant="outline" pendingText="Đang lưu…">Lưu kịch bản</SubmitButton>
              </form>
            </details>
            <div className="mt-2 flex items-center gap-2 text-[12.5px]">
              <span className="w-[68px] shrink-0 text-[11.5px] text-ink-3">Chiến dịch</span>
              <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1">{vLinks?.length ? <CampaignTags links={vLinks} /> : <span className="text-ink-3">chưa gắn</span>}</span>
              {!linkOpen && <LinkToCampaignForm entityType="video" entityId={v.id} status={v.status} back={openHref} links={vLinks} compact />}
            </div>
            {linkOpen && (
              <div className="mt-2">
                <LinkToCampaignForm entityType="video" entityId={v.id} status={v.status} back={openHref} links={vLinks} compact open />
              </div>
            )}
          </Side>


          {feedback.length > 0 && (
            <Side title="Lịch sử">
              <ol className="m-0 grid list-none gap-1 p-0">{recent.map(feedbackItem)}</ol>
              {older.length > 0 && (
                <div className="mt-2">
                  <MoreOptions label={`Xem thêm ${older.length}`}>
                    <ol className="m-0 grid list-none gap-1 p-0">{older.map(feedbackItem)}</ol>
                  </MoreOptions>
                </div>
              )}
            </Side>
          )}

          {(fileLinks.length > 0 || versions.length > 0) && (
            <Side>
              <MoreOptions label={`Tệp · ${fileLinks.length}`}>
                <div className="flex flex-wrap gap-1.5">
                  {fileLinks.map((l) => (
                    <a key={l.label} href={l.href} {...(l.blank ? { target: "_blank", rel: "noreferrer" } : {})} className="inline-flex h-[26px] items-center rounded-full border border-border-2 px-2.5 text-[12px] font-medium text-ink hover:border-ink-3">{l.label}</a>
                  ))}
                </div>
                <p className="num m-0 text-[11.5px] text-ink-3">
                  Các bản dựng: {versions.map((n) => `v${n}`).join(", ") || "chưa có"}
                  {report ? ` · ${report.output.seconds.toFixed(1)} giây · dựng mất ${Math.round(report.elapsedSec)} giây` : ""}
                </p>
              </MoreOptions>
            </Side>
          )}
        </aside>
      </div>
    </>
  );
}
