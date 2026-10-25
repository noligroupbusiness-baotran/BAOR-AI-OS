import Link from "next/link";
import { PageHead, Panel, PanelHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Segment } from "@/components/ui/segment";
import { EmptyState } from "@/components/ui/empty-state";
import { platformLabel } from "@/components/ui/platform";
import { ConfirmAction } from "@/components/campaigns/confirm-action";
import { CampaignContextBar } from "@/components/campaigns/campaign-context";
import { CampaignTags, LinkToCampaignForm } from "@/components/campaigns/entity-campaign";
import { campaignRepo } from "@/lib/campaigns/repository";
import { readCampaignContext, withCampaignContext } from "@/lib/campaigns/context";
import { deleteVideoAction, linkVideoScriptAction, rerenderVideoAction, stopVideoJobAction, transitionVideo } from "@/lib/actions/videos";
import { LinkButton } from "@/components/ui/button";
import { SubmitButton } from "@/components/campaigns/submit-button";
import { SourceDrop } from "@/components/video/source-drop";
import { VideoScheduleForm } from "@/components/publishing/video-schedule";
import { AutoRefresh } from "@/components/video/auto-refresh";
import { VideoPlayer } from "@/components/video/video-player";
import { FramingEditor } from "@/components/video/framing-editor";
import { PlanEditor } from "@/components/video/plan-editor";
import { CompareVersions, ReviewWorkspace } from "@/components/video/review-workspace";
import { comparableVersions, listComments, verifyComments } from "@/lib/video/review";
import { listContent } from "@/lib/queries";
import { fileUrl } from "@/lib/uploads";
import { listVideos } from "@/lib/videos/repository";
import { brollLibrary, editSettings, jobVersions, latestJob, readEditorPlan, readReport } from "@/lib/video/jobs";
import { blockersForVideo } from "@/lib/video/approval";
import { qaLabel, qaTone } from "@/lib/video/job-types";
import { feedbackLabel, listVideoFeedback, type FeedbackKind } from "@/lib/video/feedback";
import { kindOf } from "@/lib/content/formats";
import { videoStatusLabel, type VideoStatus } from "@/lib/data/videos";
import { formatDateTime, cn } from "@/lib/format";
import type { Platform } from "@/lib/types";

export const metadata = { title: "Video Studio – BAOR AI OS" };

const tabs: { key: VideoStatus | "all"; label: string }[] = [
  { key: "all", label: "Tất cả" },
  { key: "editing", label: "Đang dựng" },
  { key: "review", label: "Chờ kiểm tra" },
  { key: "needs_changes", label: "Cần chỉnh sửa" },
  { key: "pending_approval", label: "Chờ phê duyệt" },
  { key: "approved", label: "Đã phê duyệt" },
];

const jobFile = (videoId: string, version: number, name: string) => `/api/video-jobs/${videoId}/v${version}/${name}`;

export default async function VideoStudioPage({ searchParams }: { searchParams: Promise<{ tab?: string; campaign?: string; goal?: string; link?: string; upload?: string; content?: string; open?: string }> }) {
  const sp = await searchParams;
  const scripts = listContent().filter((c) => kindOf(c.format) === "script" && (c.status === "approved" || c.status === "scheduled" || c.status === "published"));
  const tab = tabs.some((t) => t.key === sp.tab) ? (sp.tab as VideoStatus | "all") : "all";
  const ctx = readCampaignContext(sp);
  const campaign = ctx.campaignId ? campaignRepo.get(ctx.campaignId) : undefined;
  const linkedIds = campaign ? new Set(campaignRepo.links(campaign.id, ctx.channelGoalId).filter((l) => l.entityType === "video").map((l) => l.entityId)) : null;
  const all = listVideos().filter((v) => (linkedIds ? linkedIds.has(v.id) : true));
  const list = tab === "all" ? all : all.filter((v) => v.status === tab);
  const links = campaignRepo.linksForEntities("video", all.map((v) => v.id));
  const back = withCampaignContext(`/video-studio?tab=${tab}`, ctx);
  // Ảnh / clip dùng được (có giấy phép, có tệp) cho bảng biên tập
  const planImages = sp.open
    ? brollLibrary()
        .filter((b) => b.exists && b.license.trim())
        .map((b) => ({ file: b.file, label: `${b.file.replace(/^anh\//, "").replace(/\.[a-z0-9]+$/i, "")}${b.keywords.length ? ` (${b.keywords.slice(0, 2).join(", ")})` : ""}` }))
    : [];
  const count = (s: VideoStatus) => all.filter((v) => v.status === s).length;
  const jobs = new Map(list.map((v) => [v.id, latestJob(v.id)]));
  const busy = [...jobs.values()].some((j) => j && (j.job.status === "queued" || j.job.status === "running"));

  return (
    <>
      <AutoRefresh active={busy} />
      <PageHead
        title="Quay & edit video"
        sub="Tải video quay xong — AI edit theo skill, anh duyệt."
        action={sp.upload === "1" ? undefined : <LinkButton href={withCampaignContext("/video-studio?upload=1", ctx)} variant="primary" size="md">Thêm video gốc</LinkButton>}
      />

      {sp.upload === "1" && (
        <Panel>
          <PanelHeader title="Thêm video gốc" sub="Tải dạng luồng, tối đa 8 GB mỗi tệp. Xong là tự xếp hàng dựng; theo dõi tiến độ ở mục Đang dựng." action={<LinkButton href={withCampaignContext("/video-studio", ctx)} variant="ghost">Đóng</LinkButton>} />
          <SourceDrop scripts={scripts.map((c) => ({ id: c.id, title: c.title }))} defaultContentId={sp.content ?? ""} defaultCut={editSettings().cutSilence} />
        </Panel>
      )}
      <CampaignContextBar ctx={ctx} pathname="/video-studio" params={{ tab }} note={linkedIds ? "chỉ hiện video của chiến dịch" : undefined} />

      <div className="mt-3.5 grid grid-cols-2 gap-2.5 md:grid-cols-4">
        {(["editing", "review", "pending_approval", "approved"] as VideoStatus[]).map((s) => (
          <Link key={s} href={withCampaignContext(`/video-studio?tab=${s}`, ctx)} className="card px-3.5 py-2.5 transition-colors hover:border-ink-3 hover:bg-ground-2">
            <div className="text-[12px] font-medium text-ink-2">{videoStatusLabel[s].label}</div>
            <div className={cn("num text-[20px] font-bold leading-tight", s === "pending_approval" && count(s) ? "text-amber" : "text-ink")}>{count(s)}</div>
          </Link>
        ))}
      </div>

      <div className="mt-3.5 overflow-x-auto">
        <Segment basePath={withCampaignContext("/video-studio", ctx)} active={tab} items={tabs.map((t) => ({ key: t.key, label: t.key === "all" ? `${t.label} · ${all.length}` : `${t.label} · ${count(t.key as VideoStatus)}` }))} />
      </div>

      <Panel>
        <PanelHeader title={tabs.find((t) => t.key === tab)?.label ?? "Video"} />
        {list.length === 0 ? (
          <EmptyState title={linkedIds ? "Chiến dịch này chưa có video" : "Chưa có video ở mục này"} hint="Quay theo kịch bản đã duyệt rồi bấm “Thêm video gốc”." />
        ) : (
          <ul className="m-0 list-none p-0">
            {list.map((v) => {
              const st = videoStatusLabel[v.status];
              const vLinks = links.get(v.id);
              const jv = jobs.get(v.id) ?? null;
              const running = jv && (jv.job.status === "queued" || jv.job.status === "running");
              const report = jv?.job.status === "done" ? jv.report : null;
              const isOpen = sp.open === v.id;
              const hasPreview = !!report && jv!.files.includes("preview.mp4");
              const versions = jobVersions(v.id);
              const feedback = isOpen ? listVideoFeedback(v.id) : [];
              // Video Review: kiểm góp ý đang chờ bản mới (lặp an toàn; bộ dựng cũng gọi khi xong), rồi đọc danh sách
              if (isOpen) {
                try {
                  verifyComments(v.id);
                } catch (e) {
                  console.error(`[BAOR] Kiểm góp ý video ${v.id} lỗi:`, e);
                }
              }
              const comments = isOpen ? listComments(v.id) : [];
              const compare = isOpen ? comparableVersions(v.id) : [];
              // Bản mới đang dựng / lỗi: góp ý vẫn xem được trên bản đã dựng xong gần nhất (kết quả kiểm "chưa áp dụng" phải thấy được)
              const reviewVersion = hasPreview ? jv!.job.version : (compare[0] ?? null);
              const reviewReport = reviewVersion !== null && !hasPreview ? readReport(v.id, reviewVersion) : report;
              const approveBlockers = v.status === "pending_approval" ? blockersForVideo(v) : [];
              const canRerender = jv && !running && jv.job.status !== "setup" && (v.status === "review" || v.status === "needs_changes" || v.status === "editing" || jv.job.status === "error");
              return (
                <li key={v.id} className={cn("grid gap-3 border-b border-border px-4 py-3 last:border-b-0 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start", isOpen && "bg-jade-soft/20")}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={withCampaignContext(`/video-studio?tab=${tab}${isOpen ? "" : `&open=${v.id}`}`, ctx)} className="text-[13.5px] font-semibold text-ink hover:underline">{v.title}</Link>
                      <Pill tone={st.tone}>{st.label}</Pill>
                      <Pill className="num">Bản {v.version}</Pill>
                      {report && <Pill tone={report.failed.length ? "brick" : "jade"}>{report.failed.length ? `Chưa đạt ${report.failed.join(", ")}` : "Bảng kiểm đạt"}</Pill>}
                      {report && report.blockers.length > 0 && <Pill tone="amber">{report.blockers.length} điểm chặn đăng</Pill>}
                      {jv?.job.status === "error" && <Pill tone="brick">Dựng lỗi</Pill>}
                    </div>
                    <div className="mt-1 text-[12px] text-ink-2">
                      {v.agent} · Phiên bản cho {v.platforms.map((p) => platformLabel(p as Platform)).join(", ") || "chưa chọn nền tảng"} · <span className="num">{formatDateTime(v.updatedAt)}</span>
                    </div>
                    <div className="mt-1 text-[12px] text-ink-2">
                      Kịch bản: {v.contentId ? <Link href={`/content?tab=done&open=${v.contentId}`} className="text-jade hover:underline">{v.contentTitle ?? v.contentId}</Link> : <span className="text-ink-3">chưa gắn kịch bản</span>}
                      {report?.transcript?.script && <span className="text-ink-3"> · bản {jv!.job.version} sửa theo kịch bản {report.transcript.scriptFixes?.filter((f) => f.from !== f.to).length ?? 0} từ</span>}
                    </div>
                    {isOpen && (
                      <form action={linkVideoScriptAction} className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12px]" aria-label="Gắn kịch bản">
                        <input type="hidden" name="id" value={v.id} />
                        <input type="hidden" name="back" value={withCampaignContext(`/video-studio?tab=${tab}&open=${v.id}`, ctx)} />
                        <select name="contentId" defaultValue={v.contentId ?? ""} aria-label="Kịch bản đã duyệt" className="h-7 max-w-[260px] rounded border border-border-2 bg-surface px-1 text-ink">
                          <option value="">Không gắn kịch bản</option>
                          {scripts.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                        </select>
                        <SubmitButton variant="outline" pendingText="Đang lưu…">Lưu kịch bản</SubmitButton>
                        <span className="text-ink-3">Bản dựng sau dùng kịch bản để nghe đúng tên riêng, sửa chữ nghe sai và cho biên tập AI ngữ cảnh.</span>
                      </form>
                    )}
                    {jv?.job.status === "setup" && (
                      <div className="mt-2 grid gap-2">
                        <FramingEditor mode="start" videoId={v.id} back={back} sourceUrl={fileUrl(jv.job.sourceUploadId)} aspect={jv.job.aspect ?? "9:16"} fx={jv.job.framing?.x} fy={jv.job.framing?.y} fz={jv.job.framing?.zoom} cut={jv.job.cutSilence} />
                        <div><ConfirmAction action={deleteVideoAction} fields={{ id: v.id, back }} label="Xoá video" title={`Xoá video “${v.title}”?`} message="Gỡ video khỏi Video Studio. Tệp gốc được chuyển vào thư mục lưu trữ (data/removed), khôi phục được." confirmLabel="Xoá" variant="ghost" /></div>
                      </div>
                    )}
                    {running && (
                      <div className="mt-2 max-w-[420px]">
                        <div className="flex justify-between text-[12px] text-ink-2"><span>{jv.job.status === "queued" ? "Đang chờ tới lượt dựng" : (jv.progress?.label ?? "Đang dựng")}</span><span className="num">{jv.progress?.pct ?? 0}%</span></div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ground-2"><div className="h-full rounded-full bg-jade transition-[width]" style={{ width: `${jv.progress?.pct ?? 0}%` }} /></div>
                        <div className="mt-1.5 flex flex-wrap gap-2">
                          <ConfirmAction action={stopVideoJobAction} fields={{ id: v.id, back }} label="Dừng dựng" title="Dừng bản đang dựng?" message="Bản đang dựng bị huỷ; các bản trước vẫn giữ. Có thể dựng lại sau." confirmLabel="Dừng" variant="ghost" />
                          <ConfirmAction action={deleteVideoAction} fields={{ id: v.id, back }} label="Xoá video" title={`Xoá video “${v.title}”?`} message="Dừng dựng và gỡ video khỏi Video Studio. Tệp gốc, các bản dựng và lịch sử được chuyển vào thư mục lưu trữ (data/removed), khôi phục được." confirmLabel="Xoá" variant="ghost" />
                        </div>
                      </div>
                    )}
                    {jv?.job.status === "error" && <p className="mt-1 text-[12px] text-brick">{jv.job.error}</p>}
                    {v.note && !running && <p className="mt-1 text-[12px] text-ink">{v.note}</p>}
                    {isOpen && reviewVersion !== null && (hasPreview || comments.length > 0 || jv?.job.status === "error") ? (
                      <ReviewWorkspace
                        videoId={v.id}
                        version={reviewVersion}
                        back={withCampaignContext(`/video-studio?tab=${tab}&open=${v.id}`, ctx)}
                        src={jobFile(v.id, reviewVersion, "preview.mp4")}
                        hdSrc={hasPreview && v.uploadId ? fileUrl(v.uploadId) : undefined}
                        plan={readEditorPlan(v.id).plan}
                        keep={reviewReport?.output.keep ?? null}
                        comments={comments}
                        canApply={!!canRerender}
                      />
                    ) : hasPreview ? (
                      <VideoPlayer src={jobFile(v.id, jv!.job.version, "preview.mp4")} hdSrc={v.uploadId ? fileUrl(v.uploadId) : undefined} />
                    ) : (
                      v.uploadId && <VideoPlayer src={fileUrl(v.uploadId)} />
                    )}
                    {isOpen && !hasPreview && comments.some((c) => c.status === "planned") && <p className="mt-1 text-[12px] text-ink-2">{comments.filter((c) => c.status === "planned").length} góp ý đang chờ bản dựng mới (đang xem bản {reviewVersion}); kết quả kiểm hiện khi dựng xong.</p>}
                    {isOpen && compare.length >= 2 && <div className="mt-3"><CompareVersions videoId={v.id} versions={compare} /></div>}

                    {isOpen && jv && !running && jv.job.status !== "setup" && (
                      <div className="mt-3">
                        <PlanEditor videoId={v.id} back={back} plan={readEditorPlan(v.id).plan} keep={report?.output.keep ?? null} images={planImages} canRerender={!!canRerender} />
                      </div>
                    )}
                    {isOpen && report && (
                      <div className="mt-3 grid gap-3">
                        {report.blockers.length > 0 && (
                          <div className="rounded-md border border-amber/40 bg-amber-soft px-3 py-2 text-[12.5px]">
                            <div className="font-semibold text-amber">Điểm chặn đăng (cần OWNER xử lý hoặc ghi nhận khi duyệt)</div>
                            <ul className="m-0 mt-1 list-disc pl-4 text-ink">{report.blockers.map((b) => <li key={b}>{b}</li>)}</ul>
                          </div>
                        )}
                        <div className="overflow-x-auto rounded-md border border-border">
                          <table className="w-full min-w-[560px] border-collapse text-[12px]">
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
                        <div className="flex flex-wrap gap-3 text-[12px]">
                          {jv!.files.includes("contact.jpg") && <a href={jobFile(v.id, jv!.job.version, "contact.jpg")} target="_blank" rel="noreferrer" className="text-jade hover:underline">Ảnh mốc</a>}
                          {jv!.files.includes("compare.jpg") && <a href={jobFile(v.id, jv!.job.version, "compare.jpg")} target="_blank" rel="noreferrer" className="text-jade hover:underline">So gốc và bản dựng</a>}
                          {jv!.files.includes("phu-de.srt") && <a href={jobFile(v.id, jv!.job.version, "phu-de.srt")} className="text-jade hover:underline">Phụ đề .srt</a>}
                          {jv!.files.includes("transcript.txt") && <a href={jobFile(v.id, jv!.job.version, "transcript.txt")} target="_blank" rel="noreferrer" className="text-jade hover:underline">Lời đã nghe</a>}
                          {jv!.files.includes("report.json") && <a href={jobFile(v.id, jv!.job.version, "report.json")} target="_blank" rel="noreferrer" className="text-jade hover:underline">Báo cáo đầy đủ</a>}
                          {v.uploadId && <a href={fileUrl(v.uploadId)} className="text-jade hover:underline">Tải bản chính</a>}
                          <span className="text-ink-3">Các bản dựng: {versions.map((n) => `v${n}`).join(", ")} · {report.output.seconds.toFixed(1)} giây · dựng mất {Math.round(report.elapsedSec)} giây</span>
                        </div>
                      </div>
                    )}
                    {v.status === "approved" && <VideoScheduleForm videoId={v.id} back={withCampaignContext(`/video-studio?tab=${tab}&open=${v.id}`, ctx)} />}
                    {isOpen && feedback.length > 0 && (
                      <div className="mt-3">
                        <div className="lbl">Lịch sử phản hồi</div>
                        <ol className="m-0 mt-1 grid list-none gap-1 p-0 text-[12px]">
                          {feedback.map((f) => (
                            <li key={f.id} className="rounded-md border border-border bg-ground px-2.5 py-1.5">
                              <span className="font-semibold text-ink">{feedbackLabel[f.kind as FeedbackKind] ?? f.kind}</span> · bản <span className="num">{f.version}</span> · {f.by} · <span className="num">{formatDateTime(f.at)}</span>
                              {f.note && <div className="mt-0.5 whitespace-pre-line text-ink-2">{f.note}</div>}
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <CampaignTags links={vLinks} />
                      <LinkToCampaignForm entityType="video" entityId={v.id} status={v.status} back={back} links={vLinks} compact open={sp.link === v.id} />
                    </div>
                  </div>
                  <div className="flex flex-wrap content-start gap-1.5 lg:max-w-[260px] lg:justify-end">
                    {!running && (v.status === "editing" || v.status === "needs_changes") && (
                      <ConfirmAction action={transitionVideo} fields={{ id: v.id, kind: "send_review", back }} label="Gửi kiểm tra" title="Chuyển video sang chờ kiểm tra?" message="Dùng khi bản dựng đã xong và bạn muốn xem bản này." confirmLabel="Gửi kiểm tra" variant="soft" />
                    )}
                    {v.status === "review" && (
                      <ConfirmAction action={transitionVideo} fields={{ id: v.id, kind: "send_approval", back }} label="Đạt, gửi phê duyệt" title="Gửi video đi phê duyệt?" message="Video sẽ hiện ở Chờ phê duyệt của chiến dịch đã gắn." confirmLabel="Gửi phê duyệt" variant="primary" />
                    )}
                    {v.status === "pending_approval" && (
                      <ConfirmAction
                        action={transitionVideo}
                        fields={{ id: v.id, kind: "approve", back }}
                        label="Phê duyệt"
                        title="Phê duyệt video này?"
                        message={approveBlockers.length ? `Còn ${approveBlockers.length} điểm chặn đăng: ${approveBlockers.join("; ")}. Ghi rõ đã xử lý thế nào.` : "Video được đánh dấu đã duyệt để lên lịch đăng. Không tự động đăng."}
                        confirmLabel="Phê duyệt"
                        variant="primary"
                        withNote={approveBlockers.length ? { label: "Cách xử lý điểm chặn đăng", required: true, placeholder: "VD: Đã mua giấy phép font; logo giữ cỡ 420; đã nghe lại các từ chưa chắc" } : { label: "Ghi chú (tùy chọn)" }}
                      />
                    )}
                    {(v.status === "review" || v.status === "pending_approval") && (
                      <ConfirmAction action={transitionVideo} fields={{ id: v.id, kind: "request_changes", back }} label="Yêu cầu chỉnh sửa" title="Yêu cầu chỉnh sửa?" message="Ghi chú được lưu vào lịch sử phản hồi. Chỉnh thông số rồi bấm Dựng lại, hoặc tải bản sửa tay lên." confirmLabel="Gửi yêu cầu" withNote={{ label: "Điều cần sửa", required: true, placeholder: "VD: Cắt khoảng lặng, đổi nhạc nhẹ hơn" }} />
                    )}
                    {canRerender && (
                      <>
                        <ConfirmAction action={deleteVideoAction} fields={{ id: v.id, back }} label="Xoá video" title={`Xoá video “${v.title}”?`} message="Gỡ video khỏi Video Studio. Tệp gốc, các bản dựng và lịch sử được chuyển vào thư mục lưu trữ (data/removed), khôi phục được." confirmLabel="Xoá" variant="ghost" />
                        <ConfirmAction action={rerenderVideoAction} fields={{ id: v.id, back }} label="Dựng lại" title="Dựng lại từ video gốc?" message="Tạo bản mới, bản cũ vẫn giữ. Dùng lại lời đã nghe nếu có." confirmLabel="Dựng lại" variant="ghost" />
                        <ConfirmAction action={rerenderVideoAction} fields={{ id: v.id, back, ai: "1" }} label="AI biên tập lại" title="Để biên tập AI lập lại kế hoạch?" message="Mô hình ngôn ngữ chạy tại máy đọc lời nói, chọn chữ nhấn / sơ đồ / ảnh minh hoạ theo Skill ESV; luật kiểm nguyên văn và mật độ loại mục sai. Kế hoạch hiện tại được lưu trữ, không xoá. Tạo bản mới, bản cũ vẫn giữ." confirmLabel="AI biên tập" variant="ghost" />
                        <FramingEditor videoId={v.id} back={back} sourceUrl={fileUrl(jv!.job.sourceUploadId)} aspect={jv!.job.aspect ?? "9:16"} fx={jv!.job.framing?.x} fy={jv!.job.framing?.y} fz={jv!.job.framing?.zoom} />
                        {!jv!.job.cutSilence && <ConfirmAction action={rerenderVideoAction} fields={{ id: v.id, back, cut: "1" }} label="Dựng lại, cắt lặng" title="Dựng lại và cắt khoảng lặng?" message="Cắt các khoảng lặng ≥ 0,28 s (chừa 90 ms mỗi bên); chữ nhấn, sơ đồ, minh hoạ tự dời theo bản đã cắt." confirmLabel="Dựng lại" variant="ghost" />}
                      </>
                    )}
                    {v.status === "approved" && <Link href="/publishing#video-posts" className="inline-flex h-[26px] items-center rounded-full border border-border-2 px-2.5 text-[12px] font-medium text-ink hover:border-ink-3">Xem bài đã lên lịch</Link>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </>
  );
}
