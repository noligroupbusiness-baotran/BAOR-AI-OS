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
import { briefForContent, rebuildScriptFromBrief } from "@/lib/research";
import { getContentVersion, recordContentVersion } from "@/lib/content/versions";
import { rewriteViolations } from "@/lib/content/shooting-script";
import { approveBlock, submitBlock } from "@/lib/content/review-gate";
import { scheduleTextPosts } from "@/lib/publishing/text";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function claimIdea(fd: FormData) {
  await currentActor();
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
  await currentActor();
  const id = str(fd, "id");
  getDb().update(schema.contentItems).set({ status: "dismissed" }).where(eq(schema.contentItems.id, id)).run();
  campaignRepo.syncEntityStatus("content", id, "dismissed");
  done("/content", "Đã bỏ qua ý tưởng");
}

export async function submitForReview(fd: FormData) {
  const actor = await currentActor();
  const id = str(fd, "id");
  const draft = str(fd, "draft");
  const db = getDb();
  const current = db.select().from(schema.contentItems).where(eq(schema.contentItems.id, id)).get();
  if (!current) return done("/content?tab=mine&tone=error", "Không tìm thấy nội dung");
  // Nội dung đã duyệt / đã lên lịch không được sửa tại chỗ (phải quay về luồng viết và duyệt lại).
  if (current.status !== "in_progress" && current.status !== "review") return done(`/content?tab=mine&open=${id}&tone=error`, "Chỉ gửi duyệt được nội dung đang viết hoặc chờ duyệt.");
  // Kịch bản quay sinh từ brief nghiên cứu phải qua luật kiểm trước khi tới OWNER (CP02).
  const block = submitBlock(current, draft || current.draft || "");
  if (block) {
    if (draft) {
      db.update(schema.contentItems).set({ draft }).where(eq(schema.contentItems.id, id)).run();
      recordContentVersion(id, { hook: current.hook, draft, reason: "save", by: actor.name });
    }
    return done(`/content?tab=mine&open=${id}&tone=error`, `Đã lưu nháp nhưng chưa gửi duyệt: ${block}`);
  }
  db.update(schema.contentItems)
    .set({ status: "review", ...(draft ? { draft } : {}) })
    .where(eq(schema.contentItems.id, id))
    .run();
  recordContentVersion(id, { hook: current.hook, draft: draft || current.draft || "", reason: "submit", by: actor.name });
  campaignRepo.syncEntityStatus("content", id, "review");
  for (const l of campaignRepo.linksForEntities("content", [id]).get(id) ?? []) {
    const item = db.select().from(schema.contentItems).where(eq(schema.contentItems.id, id)).get();
    campaignRepo.addApproval({ campaignId: l.campaignId, channelGoalId: l.channelGoalId, type: "content", title: `Duyệt bài “${item?.title ?? id}”`, entityType: "content", entityId: id, requestedBy: "human", note: "" });
  }
  done("/content?tab=mine", "Đã gửi duyệt");
}

export async function saveDraft(fd: FormData) {
  const actor = await currentActor();
  const id = str(fd, "id");
  const db = getDb();
  const item = db.select().from(schema.contentItems).where(eq(schema.contentItems.id, id)).get();
  if (!item) return done("/content?tab=mine&tone=error", "Không tìm thấy nội dung");
  // Nội dung đã duyệt không sửa tại chỗ: muốn sửa thì phải qua duyệt lại.
  if (item.status !== "in_progress" && item.status !== "review") return done(`/content?tab=mine&open=${id}&tone=error`, "Chỉ sửa được nội dung đang viết hoặc chờ duyệt.");
  const hook = str(fd, "hook") || item.hook;
  db.update(schema.contentItems).set({ draft: str(fd, "draft"), hook }).where(eq(schema.contentItems.id, id)).run();
  recordContentVersion(id, { hook, draft: str(fd, "draft"), reason: "save", by: actor.name });
  done(`/content?tab=mine&open=${id}`, "Đã lưu bản nháp");
}

export async function approveContent(fd: FormData) {
  await requirePermission("manager", "/content?tab=mine");
  const id = str(fd, "id");
  const db = getDb();
  const item = db.select().from(schema.contentItems).where(eq(schema.contentItems.id, id)).get();
  if (!item) return done("/content?tab=mine&tone=error", "Không tìm thấy nội dung");
  const block = approveBlock(item);
  if (block) return done(`/content?tab=mine&open=${id}&tone=error`, `Chưa duyệt được: ${block}`);
  db.update(schema.contentItems).set({ status: "approved" }).where(eq(schema.contentItems.id, id)).run();
  campaignRepo.syncEntityStatus("content", id, "approved");
  for (const l of campaignRepo.linksForEntities("content", [id]).get(id) ?? []) campaignRepo.decideEntityApprovals(l.campaignId, "content", id, "approved", "human");
  logActivity("human", `Bạn đã duyệt nội dung “${item.title}”.`, "creator");
  if (kindOf(item.format) === "script") return done(`/content?tab=done&open=${id}`, "Đã duyệt kịch bản. Mở bản đọc khi quay, quay xong thì tải video lên Video Studio.");
  done("/content?tab=done", "Đã duyệt. Hệ thống sẽ xếp lịch đăng.");
}

export async function scheduleContent(fd: FormData) {
  // Chỉ nội dung đã được duyệt mới được lên lịch đăng; người lên lịch cần quyền quản lý trở lên.
  const actor = await requirePermission("manager", "/content?tab=done");
  const id = str(fd, "id");
  const when = str(fd, "when"); // datetime-local (giờ VN)
  const platforms = fd.getAll("platform").map(String);
  const back = `/content?tab=done${id ? `&open=${id}` : ""}`;
  if (!when || platforms.length === 0) return done(`${back}&tone=error`, "Cần chọn giờ và ít nhất một kênh");
  // Cùng cổng với bài video: chế độ thử, chống trùng theo trang, chặn giờ đã qua, chặn kiểu / kênh không hợp (src/lib/publishing/text.ts)
  const r = scheduleTextPosts({ contentId: id, platforms, whenIso: new Date(`${when}:00+07:00`).toISOString(), by: actor.name });
  if (!r.ok) return done(`${back}&tone=error`, r.error);
  done("/publishing", r.mode === "dry_run" ? "Đã lên lịch (chế độ thử: không đăng thật)" : "Đã lên lịch đăng");
}

export async function createIdea(fd: FormData) {
  await currentActor();
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
  await currentActor();
  const result = await generateIdeas(5);
  if (!result.ok) return done("/content", result.error);
  logActivity("ai", `AI đề xuất ${result.count} ý tưởng nội dung mới.`, "content");
  done("/content", `AI vừa đề xuất ${result.count} ý tưởng`);
}

export async function aiWriteDraft(fd: FormData) {
  const actor = await currentActor();
  const id = str(fd, "id");
  const brief = briefForContent(id);
  const db = getDb();
  const current = db.select().from(schema.contentItems).where(eq(schema.contentItems.id, id)).get();
  if (!current) return done("/content?tab=mine&tone=error", "Không tìm thấy nội dung");
  // Kiểm trạng thái TRƯỚC mọi lần ghi: nội dung đã duyệt không sửa tại chỗ.
  if (current.status !== "in_progress" && current.status !== "review") return done(`/content?tab=mine&open=${id}&tone=error`, "Chỉ AI viết lại được nội dung đang viết hoặc chờ duyệt.");
  // Lưu chữ đang gõ trong khung trước khi AI viết lại, để không mất phần chưa bấm Lưu.
  const typed = str(fd, "draft");
  if (typed) db.update(schema.contentItems).set({ draft: typed }).where(eq(schema.contentItems.id, id)).run();
  const before = db.select().from(schema.contentItems).where(eq(schema.contentItems.id, id)).get()!;
  recordContentVersion(id, { hook: before.hook, draft: before.draft ?? "", reason: "save", by: actor.name });
  // Nội dung từ brief: AI chỉ được đổi câu chữ (không đổi dấu OWNER, nguồn, căn cứ, không thêm số).
  const result = await writeDraft(id, brief ? BRIEF_REWRITE_RULES : undefined, brief ? (d) => rewriteViolations(before.draft ?? "", d) : undefined);
  if (!result.ok) return done(`/content?tab=mine&open=${id}&tone=error`, result.error);
  recordContentVersion(id, { hook: before.hook, draft: result.draft, reason: "ai", by: `AI (${actor.name} yêu cầu)` });
  done(`/content?tab=mine&open=${id}`, "AI đã viết bản nháp, bạn sửa rồi gửi duyệt");
}

const BRIEF_REWRITE_RULES = [
  "Viết lại lời thoại của kịch bản quay cho tự nhiên, dễ nói, tiếng Việt, giọng người đào tạo thực tế.",
  "Luật bắt buộc:",
  "- Chỉ dùng các ý đã có trong kịch bản. Không thêm số liệu, nghiên cứu, ví dụ hay lời khuyên mới.",
  "- Giữ nguyên tiêu đề cảnh, các dòng 'Căn cứ:' và toàn bộ mục NGUỒN. Con số chỉ ở cảnh có Căn cứ.",
  "- Giữ nguyên tiêu đề cảnh dạng '1. HOOK (0–3s)' và mọi dòng 'Gợi ý OWNER: [OWNER KỂ: …]'. Không viết câu chuyện, trải nghiệm hay quan điểm cá nhân thay OWNER.",
  "- Không đổi con số sang chữ và không thêm con số.",
  "- Quan sát của nhà cung cấp phải nói là quan sát, không nói như sự thật khoa học.",
  "- Không chép nguyên văn câu dài từ nguồn.",
  "Trả về toàn bộ kịch bản, không giải thích.",
].join("\n");

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
  await currentActor();
  const id = str(fd, "id");
  const db = getDb();
  const item = db.select().from(schema.contentItems).where(eq(schema.contentItems.id, id)).get();
  if (!item) return done("/content", "Không tìm thấy nội dung");
  if (item.status !== "in_progress" && item.status !== "review") return done(`/content?tab=mine&open=${id}&tone=error`, "Nội dung đã duyệt: không sửa tại chỗ.");
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
  if (item.status !== "in_progress" && item.status !== "review") return done(`${back}&tone=error`, "Nội dung đã duyệt: không sửa tại chỗ.");
  if (!(file instanceof File) || file.size === 0) return done(`${back}&tone=error`, "Chưa chọn tệp ảnh.");
  const r = await saveUpload("image", file, actor.email, { contentId: id, title: item.title });
  if (!r.ok) return done(`${back}&tone=error`, `Ảnh: ${r.error}`);
  if (item.assetUploadId) deleteUpload(item.assetUploadId);
  db.update(schema.contentItems).set({ assetUploadId: r.upload.id }).where(eq(schema.contentItems.id, id)).run();
  logActivity("human", `${actor.name} đính kèm ảnh cho “${item.title}”.`, "creator");
  done(back, "Đã đính kèm ảnh");
}

export async function removeContentImage(fd: FormData) {
  await currentActor();
  const id = str(fd, "id");
  const db = getDb();
  const item = db.select().from(schema.contentItems).where(eq(schema.contentItems.id, id)).get();
  if (!item) return done("/content", "Không tìm thấy nội dung");
  if (item.status !== "in_progress" && item.status !== "review") return done(`/content?tab=mine&open=${id}&tone=error`, "Nội dung đã duyệt: không sửa tại chỗ.");
  if (item.assetUploadId) deleteUpload(item.assetUploadId);
  db.update(schema.contentItems).set({ assetUploadId: null }).where(eq(schema.contentItems.id, id)).run();
  done(`/content?tab=mine&open=${id}`, "Đã gỡ ảnh");
}

/** Khôi phục một phiên bản cũ vào bản nháp (tạo phiên bản mới, giữ nguyên lịch sử). */
export async function restoreContentVersion(fd: FormData) {
  const actor = await currentActor();
  const id = str(fd, "id");
  const back = `/content?tab=mine&open=${id}`;
  const v = getContentVersion(id, Number(str(fd, "version")));
  const db = getDb();
  const item = db.select().from(schema.contentItems).where(eq(schema.contentItems.id, id)).get();
  if (!v || !item) return done(`${back}&tone=error`, "Không tìm thấy phiên bản");
  if (item.status !== "in_progress" && item.status !== "review") return done(`${back}&tone=error`, "Chỉ khôi phục được khi nội dung đang viết hoặc chờ duyệt.");
  db.update(schema.contentItems).set({ draft: v.draft, hook: v.hook, status: "in_progress" }).where(eq(schema.contentItems.id, id)).run();
  campaignRepo.syncEntityStatus("content", id, "in_progress");
  const n = recordContentVersion(id, { hook: v.hook, draft: v.draft, reason: "restore", by: actor.name });
  done(back, `Đã khôi phục phiên bản ${v.version} thành phiên bản ${n}. Gửi duyệt lại khi xong.`);
}

/** Dựng lại kịch bản quay từ brief nghiên cứu (giữ bản cũ trong lịch sử). */
export async function rebuildFromBrief(fd: FormData) {
  const actor = await currentActor();
  const id = str(fd, "id");
  const back = `/content?tab=mine&open=${id}`;
  let n: number;
  try {
    n = rebuildScriptFromBrief(id, actor.name);
  } catch (e) {
    return done(`${back}&tone=error`, e instanceof Error ? e.message : "Không dựng lại được");
  }
  campaignRepo.syncEntityStatus("content", id, "in_progress");
  done(back, `Đã dựng lại kịch bản từ brief thành phiên bản ${n}`);
}
