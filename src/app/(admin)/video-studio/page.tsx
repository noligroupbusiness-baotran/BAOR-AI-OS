import Link from "next/link";
import { Breadcrumb, ModuleGroups } from "@/components/shell/module-page";
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
import { rerenderVideoAction, transitionVideo } from "@/lib/actions/videos";
import { LinkButton } from "@/components/ui/button";
import { SourceDrop } from "@/components/video/source-drop";
import { VideoScheduleForm } from "@/components/publishing/video-schedule";
import { AutoRefresh } from "@/components/video/auto-refresh";
import { VideoViewer } from "@/components/video/video-viewer";
import { listContent } from "@/lib/queries";
import { fileUrl } from "@/lib/uploads";
import { listVideos } from "@/lib/videos/repository";
import { engineLabel, jobVersions, latestJob } from "@/lib/video/jobs";
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
  const count = (s: VideoStatus) => all.filter((v) => v.status === s).length;
  const jobs = new Map(list.map((v) => [v.id, latestJob(v.id)]));
  const busy = [...jobs.values()].some((j) => j && (j.job.status === "queued" || j.job.status === "running"));

  return (
    <>
      <AutoRefresh active={busy} />
      <Breadcrumb items={[{ label: "Điều hành", href: "/dashboard" }, { label: "Video Studio" }]} />
      <PageHead
        title="Video Studio"
        sub={`Quay xong, thêm video gốc: hệ thống tự dựng theo ${engineLabel()}, chạy bảng kiểm rồi đưa vào Chờ kiểm tra. Video gốc luôn được giữ. Video chỉ được đăng sau khi OWNER phê duyệt.`}
        action={sp.upload === "1" ? undefined : <LinkButton href={withCampaignContext("/video-studio?upload=1", ctx)} variant="primary" size="md">Thêm video gốc</LinkButton>}
      />

      {sp.upload === "1" && (
        <Panel>
          <PanelHeader title="Thêm video gốc" sub="Tải dạng luồng, tối đa 8 GB mỗi tệp. Xong là tự xếp hàng dựng; theo dõi tiến độ ở mục Đang dựng." action={<LinkButton href={withCampaignContext("/video-studio", ctx)} variant="ghost">Đóng</LinkButton>} />
          <SourceDrop scripts={scripts.map((c) => ({ id: c.id, title: c.title }))} defaultContentId={sp.content ?? ""} />
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
        <PanelHeader title={tabs.find((t) => t.key === tab)?.label ?? "Video"} sub="Mỗi video biết kịch bản gốc, bản dựng, bảng kiểm và lịch sử phản hồi. Bấm tên video để mở chi tiết." />
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
              const approveBlockers = v.status === "pending_approval" ? blockersForVideo(v) : [];
              const canRerender = jv && !running && (v.status === "review" || v.status === "needs_changes" || v.status === "editing" || jv.job.status === "error");
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
                    </div>
                    {running && (
                      <div className="mt-2 max-w-[420px]">
                        <div className="flex justify-between text-[12px] text-ink-2"><span>{jv.job.status === "queued" ? "Đang chờ tới lượt dựng" : (jv.progress?.label ?? "Đang dựng")}</span><span className="num">{jv.progress?.pct ?? 0}%</span></div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ground-2"><div className="h-full rounded-full bg-jade transition-[width]" style={{ width: `${jv.progress?.pct ?? 0}%` }} /></div>
                      </div>
                    )}
                    {jv?.job.status === "error" && <p className="mt-1 text-[12px] text-brick">{jv.job.error}</p>}
                    {v.note && !running && <p className="mt-1 text-[12px] text-ink">{v.note}</p>}
                    {hasPreview ? (
                      <video controls playsInline preload="metadata" src={jobFile(v.id, jv!.job.version, "preview.mp4")} className="mt-2 max-h-[360px] w-full max-w-[220px] rounded-md border border-border bg-black" />
                    ) : (
                      v.uploadId && <video controls playsInline preload="metadata" src={fileUrl(v.uploadId)} className="mt-2 max-h-[360px] w-full max-w-[220px] rounded-md border border-border bg-black" />
                    )}
                    {(hasPreview || v.uploadId) && (
                      <VideoViewer title={v.title} src={hasPreview ? jobFile(v.id, jv!.job.version, "preview.mp4") : fileUrl(v.uploadId!)} hdSrc={hasPreview && v.uploadId ? fileUrl(v.uploadId) : undefined} />
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
                  <div className="flex flex-wrap gap-1.5 lg:justify-end">
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
                        <ConfirmAction action={rerenderVideoAction} fields={{ id: v.id, back }} label="Dựng lại" title="Dựng lại từ video gốc?" message="Tạo bản mới, bản cũ vẫn giữ. Dùng lại lời đã nghe nếu có." confirmLabel="Dựng lại" variant="ghost" />
                        {!jv!.job.cutSilence && <ConfirmAction action={rerenderVideoAction} fields={{ id: v.id, back, cut: "1" }} label="Dựng lại, cắt lặng" title="Dựng lại và cắt khoảng lặng?" message="#103: cắt lặng chỉ khi được giao cho đúng video này." confirmLabel="Dựng lại" variant="ghost" />}
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
      <ModuleGroups moduleKey="video-studio" />
    </>
  );
}
