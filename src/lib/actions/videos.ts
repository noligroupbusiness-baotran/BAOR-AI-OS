"use server";

import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { campaignRepo } from "@/lib/campaigns/repository";
import type { VideoStatus } from "@/lib/data/videos";
import { done, logActivity, nowIso } from "./common";
import { currentActor, requirePermission } from "@/lib/permissions";
import { addVideoFeedback } from "@/lib/video/feedback";
import { parseAspect, parseFraming } from "@/lib/video/job-types";
import { blockersForVideo, transitionBlock } from "@/lib/video/approval";

// Video Studio: Agent Edit Video chỉ dựng và chuẩn bị phiên bản. Người kiểm tra, yêu cầu sửa và phê duyệt.
// Video đã phê duyệt vẫn KHÔNG tự đăng; việc đăng thuộc phân hệ Đăng bài & Quảng cáo.
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const fail = (path: string, msg: string): never => done(`${path}${path.includes("?") ? "&" : "?"}tone=error`, msg);

const transitions: Record<string, { from: VideoStatus[]; to: VideoStatus; label: string; toast: string }> = {
  send_review: { from: ["editing", "needs_changes"], to: "review", label: "Gửi kiểm tra", toast: "Đã chuyển sang chờ kiểm tra" },
  send_approval: { from: ["review"], to: "pending_approval", label: "Gửi phê duyệt", toast: "Đã gửi phê duyệt" },
  request_changes: { from: ["review", "pending_approval"], to: "needs_changes", label: "Yêu cầu chỉnh sửa", toast: "Đã yêu cầu Agent chỉnh sửa" },
  approve: { from: ["pending_approval"], to: "approved", label: "Phê duyệt", toast: "Đã phê duyệt. Video sẵn sàng để lên lịch đăng ở Đăng bài & Quảng cáo." },
};

export async function transitionVideo(fd: FormData) {
  const actor = await currentActor();
  const by = actor.name;
  const id = str(fd, "id");
  const kind = str(fd, "kind");
  const note = str(fd, "note");
  const back = str(fd, "back") || "/video-studio";
  const t = transitions[kind];
  if (!t) return fail(back, "Hành động không hợp lệ");
  if (kind === "approve") await requirePermission("manager", back);
  const db = getDb();
  const v = db.select().from(schema.videos).where(eq(schema.videos.id, id)).get();
  if (!v) return fail(back, "Không tìm thấy video");
  if (!t.from.includes(v.status as VideoStatus)) return fail(back, `Không thể ${t.label.toLowerCase()} khi video đang ở trạng thái hiện tại.`);
  // Điểm chặn đăng (giấy phép font/nhạc, logo, từ nghe chưa chắc, video chưa qua bảng kiểm…): OWNER phải ghi rõ đã xử lý thế nào.
  const block = transitionBlock(v, kind, note);
  if (block) return fail(back, block);
  const blockers = kind === "approve" ? blockersForVideo(v) : [];

  db.update(schema.videos)
    .set({ status: t.to, updatedAt: nowIso(), ...(note ? { note } : {}), ...(kind === "request_changes" ? { version: v.version + 1 } : {}) })
    .where(eq(schema.videos.id, id))
    .run();
  campaignRepo.syncEntityStatus("video", id, t.to);
  addVideoFeedback({ videoId: id, version: v.version, kind: kind as "send_review" | "send_approval" | "request_changes" | "approve", note: kind === "approve" && blockers.length ? `${note}\nĐiểm chặn lúc duyệt: ${blockers.join("; ")}` : note, by });

  // Đồng bộ với phần Chờ phê duyệt của chiến dịch (nếu video đã gắn chiến dịch).
  const links = campaignRepo.linksForEntities("video", [id]).get(id) ?? [];
  for (const l of links) {
    if (kind === "send_approval") {
      campaignRepo.addApproval({ campaignId: l.campaignId, channelGoalId: l.channelGoalId, type: "video", title: `Video “${v.title}” (bản dựng ${v.version})`, entityType: "video", entityId: id, requestedBy: v.agent, note: "" });
    }
    if (kind === "approve" || kind === "request_changes") {
      campaignRepo.decideEntityApprovals(l.campaignId, "video", id, kind === "approve" ? "approved" : "rejected", by, note);
    }
    campaignRepo.log(l.campaignId, by, `${t.label} video`, v.title);
  }
  logActivity("human", `${t.label} video “${v.title}”.`, "video");
  done(back, t.toast);
}

// Dựng lại từ cùng nguồn thành bản mới (không ghi đè bản trước). Có thể bật cắt khoảng lặng cho riêng video này.
export async function stopVideoJobAction(fd: FormData) {
  const actor = await currentActor();
  const back = str(fd, "back") || "/video-studio";
  const { stopVideoJob } = await import("@/lib/video/jobs");
  const r = stopVideoJob(str(fd, "id"), actor.name);
  if (!r.ok) return fail(back, r.error);
  done(back, `Đã dừng dựng bản ${r.version}`);
}

export async function startVideoAction(fd: FormData) {
  const actor = await currentActor();
  const back = str(fd, "back") || "/video-studio";
  const { startVideoJob } = await import("@/lib/video/jobs");
  const r = startVideoJob(str(fd, "id"), actor.name, { aspect: parseAspect(str(fd, "aspect")), framing: parseFraming(str(fd, "fx"), str(fd, "fy"), str(fd, "fz")), cutSilence: str(fd, "cut") === "1" });
  if (!r.ok) return fail(back, r.error);
  done(back, "Đã xếp hàng dựng");
}

export async function saveVideoPlanAction(fd: FormData) {
  const actor = await currentActor();
  const back = str(fd, "back") || "/video-studio";
  const id = str(fd, "id");
  let raw: unknown;
  try {
    raw = JSON.parse(str(fd, "plan"));
  } catch {
    return fail(back, "Kế hoạch không đọc được");
  }
  const { writeEditorPlan, rerenderVideo } = await import("@/lib/video/jobs");
  const w = writeEditorPlan(id, raw, actor.name);
  if (!w.ok) return fail(back, w.error);
  if (str(fd, "rerender") === "1") {
    const r = rerenderVideo(id, actor.name);
    if (!r.ok) return fail(back, `Đã lưu kế hoạch; chưa dựng lại được: ${r.error}`);
    return done(back, `Đã lưu kế hoạch, đang dựng bản ${r.version}`);
  }
  done(back, "Đã lưu kế hoạch biên tập");
}

export async function deleteVideoAction(fd: FormData) {
  const actor = await currentActor();
  const back = str(fd, "back") || "/video-studio";
  const { deleteVideo } = await import("@/lib/video/jobs");
  const r = deleteVideo(str(fd, "id"), actor.name);
  if (!r.ok) return fail(back, r.error);
  done(back.replace(/([?&])open=[^&#]*&?/, "$1").replace(/[?&]$/, ""), `Đã xoá video “${r.title}”`);
}

export async function rerenderVideoAction(fd: FormData) {
  const actor = await currentActor();
  const back = str(fd, "back") || "/video-studio";
  const { rerenderVideo } = await import("@/lib/video/jobs");
  const frame = fd.get("aspect") === null ? undefined : { aspect: parseAspect(str(fd, "aspect")), framing: parseFraming(str(fd, "fx"), str(fd, "fy"), str(fd, "fz")) };
  const ai = str(fd, "ai") === "1";
  const r = rerenderVideo(str(fd, "id"), actor.name, fd.get("cut") === null ? undefined : str(fd, "cut") === "1", frame, ai ? "Biên tập AI lập lại kế hoạch (mô hình tại máy) rồi dựng" : undefined, ai);
  if (!r.ok) return fail(back, r.error);
  done(back, ai ? `Biên tập AI đang lập kế hoạch và dựng bản ${r.version}` : `Đang dựng bản ${r.version}`);
}

// ---------------------------------------------------------------- Video Review: góp ý theo mốc thời gian

function readFix(fd: FormData): import("@/lib/video/review-types").CommentFix | null | "bad" {
  const raw = str(fd, "fix");
  if (!raw) return null;
  try {
    const f = JSON.parse(raw);
    return f && typeof f === "object" ? f : "bad";
  } catch {
    return "bad";
  }
}

export async function addVideoCommentAction(fd: FormData) {
  const actor = await currentActor();
  const back = str(fd, "back") || "/video-studio";
  const fix = readFix(fd);
  if (fix === "bad") return fail(back, "Yêu cầu sửa không đọc được");
  const { addComment } = await import("@/lib/video/review");
  const tEnd = str(fd, "tEnd");
  const r = addComment({ videoId: str(fd, "id"), version: Number(str(fd, "version")), t: Number(str(fd, "t")), tEnd: tEnd ? Number(tEnd) : null, text: str(fd, "text"), fix, by: actor.name });
  if (!r.ok) return fail(back, r.error);
  done(back, "Đã lưu góp ý");
}

export async function setVideoCommentFixAction(fd: FormData) {
  const actor = await currentActor();
  const back = str(fd, "back") || "/video-studio";
  const fix = readFix(fd);
  if (fix === "bad") return fail(back, "Yêu cầu sửa không đọc được");
  const { setCommentFix } = await import("@/lib/video/review");
  const r = setCommentFix(str(fd, "commentId"), fix, actor.name);
  if (!r.ok) return fail(back, r.error);
  done(back, fix ? "Đã đặt yêu cầu sửa" : "Đã bỏ yêu cầu sửa");
}

export async function applyVideoCommentsAction(fd: FormData) {
  const actor = await currentActor();
  const back = str(fd, "back") || "/video-studio";
  const { applyComments } = await import("@/lib/video/review");
  const r = applyComments(str(fd, "id"), actor.name);
  if (!r.ok) return fail(back, r.error);
  done(back, `Đã áp ${r.applied} yêu cầu sửa, đang dựng bản ${r.version}`);
}

export async function resolveVideoCommentAction(fd: FormData) {
  const actor = await currentActor();
  const back = str(fd, "back") || "/video-studio";
  const { resolveComment } = await import("@/lib/video/review");
  const reopen = str(fd, "reopen") === "1";
  const r = resolveComment(str(fd, "commentId"), actor.name, reopen);
  if (!r.ok) return fail(back, r.error);
  done(back, reopen ? "Đã mở lại góp ý" : "Đã xác nhận góp ý xong");
}

// ---------------------------------------------------------------- Nội dung → Video: gắn kịch bản cho video có sẵn
export async function linkVideoScriptAction(fd: FormData) {
  const actor = await currentActor();
  const back = str(fd, "back") || "/video-studio";
  const { linkVideoScript } = await import("@/lib/video/jobs");
  const r = linkVideoScript(str(fd, "id"), str(fd, "contentId") || null, actor.name);
  if (!r.ok) return fail(back, r.error);
  done(back, r.title ? `Đã gắn kịch bản “${r.title}”. Bấm Dựng lại để dùng kịch bản.` : "Đã bỏ gắn kịch bản");
}
