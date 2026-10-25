// Chuyển bước duyệt video (Video Studio). Tách khỏi server action để kiểm thử được.
// "approve_direct" (OWNER 25/10/2026: "đạt rồi tại sao còn phải gửi duyệt"): người có quyền phê duyệt bấm MỘT nút "Duyệt" ở
// Chờ kiểm tra / Cần chỉnh sửa / Chờ phê duyệt → chạy tuần tự các bước còn thiếu (gửi kiểm tra → gửi phê duyệt → phê duyệt),
// mỗi bước ghi lịch sử phản hồi + đồng bộ chiến dịch như bấm từng nút. Cổng điểm chặn đăng giữ nguyên (kiểm trước khi ghi gì).
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { campaignRepo } from "@/lib/campaigns/repository";
import { logActivity } from "@/lib/activity";
import type { VideoStatus } from "@/lib/data/videos";
import { addVideoFeedback } from "@/lib/video/feedback";
import { blockersForVideo, transitionBlock } from "@/lib/video/approval";

type StepKind = "send_review" | "send_approval" | "request_changes" | "approve";
export type TransitionKind = StepKind | "approve_direct";

export const VIDEO_TRANSITIONS: Record<TransitionKind, { from: VideoStatus[]; to: VideoStatus; label: string; toast: string }> = {
  send_review: { from: ["editing", "needs_changes"], to: "review", label: "Gửi kiểm tra", toast: "Đã chuyển sang chờ kiểm tra" },
  send_approval: { from: ["review"], to: "pending_approval", label: "Gửi phê duyệt", toast: "Đã gửi phê duyệt" },
  request_changes: { from: ["review", "pending_approval"], to: "needs_changes", label: "Yêu cầu chỉnh sửa", toast: "Đã yêu cầu Agent chỉnh sửa" },
  approve: { from: ["pending_approval"], to: "approved", label: "Phê duyệt", toast: "Đã phê duyệt. Video sẵn sàng để lên lịch đăng ở Đăng bài & Quảng cáo." },
  approve_direct: { from: ["review", "needs_changes", "pending_approval"], to: "approved", label: "Duyệt", toast: "Đã duyệt · video đã vào Kho video — lên lịch đăng ngay" },
};

/** Các bước còn thiếu để từ trạng thái hiện tại tới "Đã phê duyệt". */
export function directSteps(status: VideoStatus): StepKind[] {
  if (status === "needs_changes") return ["send_review", "send_approval", "approve"];
  if (status === "review") return ["send_approval", "approve"];
  if (status === "pending_approval") return ["approve"];
  return [];
}

const NEED_APPROVER = "Cần quyền Quản lý trở lên để phê duyệt video";

export function runVideoTransition(i: { id: string; kind: string; note: string; by: string; canApprove: boolean }): { ok: true; toast: string } | { ok: false; error: string } {
  const t = VIDEO_TRANSITIONS[i.kind as TransitionKind];
  if (!t) return { ok: false, error: "Hành động không hợp lệ" };
  if ((i.kind === "approve" || i.kind === "approve_direct") && !i.canApprove) return { ok: false, error: NEED_APPROVER };
  const db = getDb();
  const v = db.select().from(schema.videos).where(eq(schema.videos.id, i.id)).get();
  if (!v) return { ok: false, error: "Không tìm thấy video" };
  if (!t.from.includes(v.status as VideoStatus)) return { ok: false, error: `Không thể ${t.label.toLowerCase()} khi video đang ở trạng thái hiện tại.` };
  const steps: StepKind[] = i.kind === "approve_direct" ? directSteps(v.status as VideoStatus) : [i.kind as StepKind];
  // Kiểm MỌI bước trước khi ghi: không để video kẹt giữa chừng (vd đã gửi phê duyệt nhưng duyệt bị chặn)
  for (const s of steps) {
    const block = transitionBlock(v, s, s === "approve" || s === "request_changes" ? i.note : "");
    if (block) return { ok: false, error: block };
  }
  // Duyệt thẳng: bước trung gian ghi lịch sử "Duyệt thẳng", ghi chú người duyệt đi vào bước phê duyệt.
  // MỌI bước ghi CSDL nằm trong MỘT transaction: lỗi ở bước sau quay lui cả bước trước (video không kẹt ở Chờ phê duyệt).
  // Các hàm con (addVideoFeedback, campaignRepo.*) ghi qua getDb() = cùng kết nối better-sqlite3 → nằm trong transaction này;
  // nếu sau này hàm con tự mở getDb().transaction thì better-sqlite3 lồng bằng savepoint. Nhật ký hoạt động ghi SAU khi commit.
  const done: string[] = [];
  try {
    db.transaction(() => {
      for (const s of steps) {
        const between = i.kind === "approve_direct" && s !== "approve";
        done.push(applyStep(i.id, s, between ? "Duyệt thẳng" : i.note, i.by, !between));
      }
    });
  } catch (e) {
    console.error(`[BAOR] Chuyển bước video ${i.id} (${i.kind}) lỗi, đã quay lui:`, e);
    return { ok: false, error: `Không ghi được bước ${t.label.toLowerCase()} — video giữ nguyên trạng thái, thử lại sau.` };
  }
  for (const msg of done) logActivity("human", msg, "video");
  return { ok: true, toast: t.toast };
}

/** Ghi một bước (gọi trong transaction của runVideoTransition). Trả lại dòng nhật ký hoạt động để ghi sau khi commit. */
function applyStep(id: string, kind: StepKind, note: string, by: string, saveNote: boolean): string {
  const t = VIDEO_TRANSITIONS[kind];
  const db = getDb();
  const v = db.select().from(schema.videos).where(eq(schema.videos.id, id)).get()!;
  const blockers = kind === "approve" ? blockersForVideo(v) : [];
  db.update(schema.videos)
    .set({ status: t.to, updatedAt: new Date().toISOString(), ...(note && saveNote ? { note } : {}), ...(kind === "request_changes" ? { version: v.version + 1 } : {}) })
    .where(eq(schema.videos.id, id))
    .run();
  campaignRepo.syncEntityStatus("video", id, t.to);
  addVideoFeedback({ videoId: id, version: v.version, kind, note: kind === "approve" && blockers.length ? `${note}\nĐiểm chặn lúc duyệt: ${blockers.join("; ")}` : note, by });

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
  return `${t.label} video “${v.title}”.`;
}
