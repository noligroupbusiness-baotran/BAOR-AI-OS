"use server";

import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { campaignRepo } from "@/lib/campaigns/repository";
import type { VideoStatus } from "@/lib/data/videos";
import { done, logActivity, nowIso } from "./common";
import { currentActor, requirePermission } from "@/lib/permissions";
import { addVideoFeedback } from "@/lib/video/feedback";
import { latestJob } from "@/lib/video/jobs";

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
  if (kind === "request_changes" && !note) return fail(back, "Cần ghi rõ điều cần chỉnh sửa");
  // Bản dựng có điểm chặn đăng (giấy phép font/nhạc, logo, từ nghe chưa chắc…): OWNER phải ghi rõ đã xử lý thế nào.
  const job = latestJob(id);
  if (job && (job.job.status === "queued" || job.job.status === "running")) return fail(back, "Video đang dựng, chờ dựng xong");
  const blockers = job?.report?.blockers ?? [];
  if (kind === "approve" && blockers.length && note.length < 10) return fail(back, `Bản dựng còn ${blockers.length} điểm chặn đăng. Ghi rõ cách xử lý trong ghi chú phê duyệt.`);

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
export async function rerenderVideoAction(fd: FormData) {
  const actor = await currentActor();
  const back = str(fd, "back") || "/video-studio";
  const { rerenderVideo } = await import("@/lib/video/jobs");
  const r = rerenderVideo(str(fd, "id"), actor.name, fd.get("cut") === null ? undefined : str(fd, "cut") === "1");
  if (!r.ok) return fail(back, r.error);
  done(back, `Đang dựng bản ${r.version}`);
}
