"use server";

import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { done, logActivity, newId, nowIso } from "./common";
import { generateIdeas, writeDraft } from "@/lib/ai";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function claimIdea(fd: FormData) {
  const id = str(fd, "id");
  const db = getDb();
  const item = db.select().from(schema.contentItems).where(eq(schema.contentItems.id, id)).get();
  if (!item) return done("/content", "Không tìm thấy ý tưởng");
  db.update(schema.contentItems).set({ status: "in_progress", assignee: "human" }).where(eq(schema.contentItems.id, id)).run();
  logActivity("human", `Bạn nhận làm “${item.title}”.`, "creator");
  done("/content?tab=mine", "Đã chuyển vào bàn làm việc của bạn");
}

export async function dismissIdea(fd: FormData) {
  const id = str(fd, "id");
  getDb().update(schema.contentItems).set({ status: "dismissed" }).where(eq(schema.contentItems.id, id)).run();
  done("/content", "Đã bỏ qua ý tưởng");
}

export async function submitForReview(fd: FormData) {
  const id = str(fd, "id");
  const draft = str(fd, "draft");
  const db = getDb();
  db.update(schema.contentItems)
    .set({ status: "review", ...(draft ? { draft } : {}) })
    .where(eq(schema.contentItems.id, id))
    .run();
  done("/content?tab=mine", "Đã gửi duyệt");
}

export async function saveDraft(fd: FormData) {
  const id = str(fd, "id");
  getDb().update(schema.contentItems).set({ draft: str(fd, "draft"), hook: str(fd, "hook") || undefined }).where(eq(schema.contentItems.id, id)).run();
  done(`/content?tab=mine&open=${id}`, "Đã lưu bản nháp");
}

export async function approveContent(fd: FormData) {
  const id = str(fd, "id");
  const db = getDb();
  const item = db.select().from(schema.contentItems).where(eq(schema.contentItems.id, id)).get();
  db.update(schema.contentItems).set({ status: "approved" }).where(eq(schema.contentItems.id, id)).run();
  if (item) logActivity("human", `Bạn đã duyệt nội dung “${item.title}”.`, "creator");
  done("/content?tab=done", "Đã duyệt. Hệ thống sẽ xếp lịch đăng.");
}

export async function scheduleContent(fd: FormData) {
  const id = str(fd, "id");
  const when = str(fd, "when"); // datetime-local (giờ VN)
  const platforms = fd.getAll("platform").map(String);
  if (!when || platforms.length === 0) return done("/content?tab=done", "Cần chọn giờ và ít nhất một kênh");
  const iso = new Date(`${when}:00+07:00`).toISOString();
  const db = getDb();
  const item = db.select().from(schema.contentItems).where(eq(schema.contentItems.id, id)).get();
  if (!item) return done("/content?tab=done", "Không tìm thấy nội dung");
  db.update(schema.contentItems).set({ status: "scheduled", scheduledFor: iso }).where(eq(schema.contentItems.id, id)).run();
  db.insert(schema.scheduledPosts)
    .values(platforms.map((p) => ({ id: newId("sp"), contentId: id, title: item.title, platform: p, scheduledFor: iso, status: "scheduled" })))
    .run();
  logActivity("system", `Đã lên lịch “${item.title}” trên ${platforms.length} kênh.`, "publishing");
  done("/publishing", "Đã lên lịch đăng");
}

export async function createIdea(fd: FormData) {
  const title = str(fd, "title");
  if (!title) return done("/content", "Cần nhập tiêu đề");
  getDb()
    .insert(schema.contentItems)
    .values({
      id: newId("ct"),
      title,
      format: str(fd, "format") || "post",
      status: "in_progress",
      insightId: null,
      pillar: str(fd, "pillar") || "Khác",
      hook: str(fd, "hook"),
      outline: "[]",
      assignee: "human",
      createdAt: nowIso(),
      score: null,
      source: "manual",
    })
    .run();
  done("/content?tab=mine", "Đã tạo bài mới");
}

export async function aiGenerateIdeas() {
  const result = await generateIdeas(5);
  if (!result.ok) return done("/content", result.error);
  logActivity("ai", `AI đề xuất ${result.count} ý tưởng nội dung mới.`, "content");
  done("/content", `AI vừa đề xuất ${result.count} ý tưởng`);
}

export async function aiWriteDraft(fd: FormData) {
  const id = str(fd, "id");
  const result = await writeDraft(id);
  if (!result.ok) return done(`/content?tab=mine&open=${id}`, result.error);
  done(`/content?tab=mine&open=${id}`, "AI đã viết bản nháp, bạn sửa rồi gửi duyệt");
}
