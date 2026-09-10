"use server";

import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { campaignRepo } from "@/lib/campaigns/repository";
import type { VideoStatus } from "@/lib/data/videos";
import { done, logActivity, nowIso } from "./common";

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
  const user = await getCurrentUser();
  const by = user?.email ?? "admin";
  const id = str(fd, "id");
  const kind = str(fd, "kind");
  const note = str(fd, "note");
  const back = str(fd, "back") || "/video-studio";
  const t = transitions[kind];
  if (!t) return fail(back, "Hành động không hợp lệ");
  const db = getDb();
  const v = db.select().from(schema.videos).where(eq(schema.videos.id, id)).get();
  if (!v) return fail(back, "Không tìm thấy video");
  if (!t.from.includes(v.status as VideoStatus)) return fail(back, `Không thể ${t.label.toLowerCase()} khi video đang ở trạng thái hiện tại.`);
  if (kind === "request_changes" && !note) return fail(back, "Cần ghi rõ điều cần chỉnh sửa");

  db.update(schema.videos)
    .set({ status: t.to, updatedAt: nowIso(), ...(note ? { note } : {}), ...(kind === "request_changes" ? { version: v.version + 1 } : {}) })
    .where(eq(schema.videos.id, id))
    .run();
  campaignRepo.syncEntityStatus("video", id, t.to);

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
