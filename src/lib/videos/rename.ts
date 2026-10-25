// Đổi tên video (OWNER 25/10/2026: "ở phần edit phải cho chỉnh sửa tên video"). Tên gọn 1–120 ký tự (gộp khoảng trắng);
// ghi lịch sử phản hồi + nhật ký hoạt động. Chỉ đổi tên hiển thị, không đụng tệp / bản dựng.
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { logActivity } from "@/lib/activity";
import { addVideoFeedback } from "@/lib/video/feedback";

export const VIDEO_TITLE_MAX = 120;

export function renameVideo(id: string, raw: string, by: string): { ok: true; title: string; changed: boolean } | { ok: false; error: string } {
  const title = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!title) return { ok: false, error: "Tên video không được để trống" };
  if ([...title].length > VIDEO_TITLE_MAX) return { ok: false, error: `Tên video tối đa ${VIDEO_TITLE_MAX} ký tự` };
  const db = getDb();
  const v = db.select().from(schema.videos).where(eq(schema.videos.id, id)).get();
  if (!v) return { ok: false, error: "Không tìm thấy video" };
  if (v.title === title) return { ok: true, title, changed: false };
  db.update(schema.videos).set({ title, updatedAt: new Date().toISOString() }).where(eq(schema.videos.id, id)).run();
  addVideoFeedback({ videoId: id, version: v.version, kind: "rename", note: `“${v.title}” → “${title}”`, by });
  logActivity("human", `${by} đổi tên video “${v.title}” thành “${title}”.`, "video");
  return { ok: true, title, changed: true };
}
