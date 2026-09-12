"use server";

import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { done, logActivity, newId, nowIso } from "./common";
import { generateIdeas, writeDraft } from "@/lib/ai";
import { campaignRepo } from "@/lib/campaigns/repository";
import { withCampaignContext } from "@/lib/campaigns/context";
import { requirePermission, currentActor } from "@/lib/permissions";
import { getSetting } from "@/lib/admin";
import { deleteUpload, saveUpload } from "@/lib/uploads";
import { imageBriefTemplate, kindOf, scriptTemplate } from "@/lib/content/formats";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function claimIdea(fd: FormData) {
  const id = str(fd, "id");
  const db = getDb();
  const item = db.select().from(schema.contentItems).where(eq(schema.contentItems.id, id)).get();
  if (!item) return done("/content", "Không tìm thấy ý tưởng");
  db.update(schema.contentItems).set({ status: "in_progress", assignee: "human" }).where(eq(schema.contentItems.id, id)).run();
  campaignRepo.syncEntityStatus("content", id, "in_progress");
  logActivity("human", `Bạn nhận làm “${item.title}”.`, "creator");
  done("/content?tab=mine", "Đã chuyển vào bàn làm việc của bạn");
}

export async function dismissIdea(fd: FormData) {
  const id = str(fd, "id");
  getDb().update(schema.contentItems).set({ status: "dismissed" }).where(eq(schema.contentItems.id, id)).run();
  campaignRepo.syncEntityStatus("content", id, "dismissed");
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
  campaignRepo.syncEntityStatus("content", id, "review");
  for (const l of campaignRepo.linksForEntities("content", [id]).get(id) ?? []) {
    const item = db.select().from(schema.contentItems).where(eq(schema.contentItems.id, id)).get();
    campaignRepo.addApproval({ campaignId: l.campaignId, channelGoalId: l.channelGoalId, type: "content", title: `Duyệt bài “${item?.title ?? id}”`, entityType: "content", entityId: id, requestedBy: "human", note: "" });
  }
  done("/content?tab=mine", "Đã gửi duyệt");
}

export async function saveDraft(fd: FormData) {
  const id = str(fd, "id");
  getDb().update(schema.contentItems).set({ draft: str(fd, "draft"), hook: str(fd, "hook") || undefined }).where(eq(schema.contentItems.id, id)).run();
  done(`/content?tab=mine&open=${id}`, "Đã lưu bản nháp");
}

export async function approveContent(fd: FormData) {
  await requirePermission("manager", "/content?tab=mine");
  const id = str(fd, "id");
  const db = getDb();
  const item = db.select().from(schema.contentItems).where(eq(schema.contentItems.id, id)).get();
  db.update(schema.contentItems).set({ status: "approved" }).where(eq(schema.contentItems.id, id)).run();
  campaignRepo.syncEntityStatus("content", id, "approved");
  for (const l of campaignRepo.linksForEntities("content", [id]).get(id) ?? []) campaignRepo.decideEntityApprovals(l.campaignId, "content", id, "approved", "human");
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
  const posts = platforms.map((p) => ({ id: newId("sp"), contentId: id, title: item.title, platform: p, scheduledFor: iso, status: "scheduled" }));
  db.insert(schema.scheduledPosts).values(posts).run();
  // Bài đăng kế thừa chiến dịch và mục tiêu kênh của nội dung (truy ngược: publication ← content).
  campaignRepo.syncEntityStatus("content", id, "scheduled");
  for (const p of posts) campaignRepo.inheritLinks("content", id, "publication", p.id, "scheduled");
  logActivity("system", `Đã lên lịch “${item.title}” trên ${platforms.length} kênh.`, "publishing");
  done("/publishing", "Đã lên lịch đăng");
}

export async function createIdea(fd: FormData) {
  const title = str(fd, "title");
  // Ngữ cảnh chiến dịch (nếu mở từ phân hệ Chiến dịch): bài mới tự gắn campaign_id + channel_goal_id.
  const campaignId = str(fd, "campaignId") || null;
  const channelGoalId = str(fd, "channelGoalId") || null;
  const ctx = { campaignId, channelGoalId };
  if (!title) return done(withCampaignContext("/content", ctx), "Cần nhập tiêu đề");
  const id = newId("ct");
  getDb()
    .insert(schema.contentItems)
    .values({
      id,
      title,
      format: str(fd, "format") || "post",
      status: "in_progress",
      insightId: null,
      pillar: str(fd, "pillar") || "Khác",
      hook: str(fd, "hook"),
      outline: "[]",
      draft: prefillDraft(str(fd, "format") || "post", title, str(fd, "hook")),
      assignee: "human",
      createdAt: nowIso(),
      score: null,
      source: "manual",
    })
    .run();
  if (campaignId && campaignRepo.get(campaignId)) {
    const goal = channelGoalId ? campaignRepo.goal(channelGoalId) : undefined;
    campaignRepo.addLink({ campaignId, channelGoalId: goal && goal.campaignId === campaignId ? goal.id : null, entityType: "content", entityId: id, status: "in_progress", ownerId: null, viaType: null, viaId: null });
    campaignRepo.log(campaignId, "human", "Gắn nội dung", `“${title}” tạo từ phân hệ Nội dung`);
  }
  done(withCampaignContext(`/content?tab=mine&open=${id}`, ctx), campaignId ? "Đã tạo bài mới và gắn vào chiến dịch" : "Đã tạo bài mới");
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

// ---------- Kịch bản video / Caption / Hình ảnh ----------

// Bài mới thuộc loại kịch bản hoặc hình ảnh được điền sẵn khung để người viết không bắt đầu từ trang trắng.
function prefillDraft(format: string, title: string, hook: string): string | null {
  const kind = kindOf(format);
  if (kind === "script") return scriptTemplate(title);
  if (kind === "image") {
    return imageBriefTemplate({ title, hook, primaryColor: getSetting("brand.primaryColor") || undefined, secondaryColor: getSetting("brand.secondaryColor") || undefined, font: getSetting("brand.font") || undefined, tagline: getSetting("brand.tagline") || undefined });
  }
  return null;
}

/** Chèn khung kịch bản hoặc brief ảnh vào bản nháp đang có (nối vào cuối, không xóa chữ đã viết). */
export async function insertTemplate(fd: FormData) {
  const id = str(fd, "id");
  const db = getDb();
  const item = db.select().from(schema.contentItems).where(eq(schema.contentItems.id, id)).get();
  if (!item) return done("/content", "Không tìm thấy nội dung");
  const tpl = prefillDraft(item.format, item.title, item.hook);
  if (!tpl) return done(`/content?tab=mine&open=${id}`, "Định dạng này không có khung mẫu.");
  const draft = item.draft?.trim() ? `${item.draft.trim()}\n\n${tpl}` : tpl;
  db.update(schema.contentItems).set({ draft }).where(eq(schema.contentItems.id, id)).run();
  done(`/content?tab=mine&open=${id}`, "Đã chèn khung mẫu vào bản nháp");
}

/** Đính kèm ảnh (PNG/JPG/WebP, tối đa 8 MB) cho bài: ảnh sản phẩm, ảnh đã thiết kế, ảnh AI tạo. */
export async function attachContentImage(fd: FormData) {
  const actor = await currentActor();
  const id = str(fd, "id");
  const back = `/content?tab=mine&open=${id}`;
  const file = fd.get("file");
  const db = getDb();
  const item = db.select().from(schema.contentItems).where(eq(schema.contentItems.id, id)).get();
  if (!item) return done("/content", "Không tìm thấy nội dung");
  if (!(file instanceof File) || file.size === 0) return done(`${back}&tone=error`, "Chưa chọn tệp ảnh.");
  const r = await saveUpload("image", file, actor.email, { contentId: id, title: item.title });
  if (!r.ok) return done(`${back}&tone=error`, `Ảnh: ${r.error}`);
  if (item.assetUploadId) deleteUpload(item.assetUploadId);
  db.update(schema.contentItems).set({ assetUploadId: r.upload.id }).where(eq(schema.contentItems.id, id)).run();
  logActivity("human", `${actor.name} đính kèm ảnh cho “${item.title}”.`, "creator");
  done(back, "Đã đính kèm ảnh");
}

export async function removeContentImage(fd: FormData) {
  const id = str(fd, "id");
  const db = getDb();
  const item = db.select().from(schema.contentItems).where(eq(schema.contentItems.id, id)).get();
  if (!item) return done("/content", "Không tìm thấy nội dung");
  if (item.assetUploadId) deleteUpload(item.assetUploadId);
  db.update(schema.contentItems).set({ assetUploadId: null }).where(eq(schema.contentItems.id, id)).run();
  done(`/content?tab=mine&open=${id}`, "Đã gỡ ảnh");
}
