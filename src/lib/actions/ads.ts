"use server";

// Quảng cáo (CP05): bật / tăng chi tiêu chỉ qua cổng ủy quyền ngân sách của OWNER (src/lib/ads/authorization.ts).
// Tạm dừng, giảm ngân sách, từ chối luôn được. Ủy quyền chỉ quản trị viên (OWNER) đặt hoặc thu hồi.
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { done, logActivity, nowIso } from "./common";
import { setSetting } from "@/lib/admin";
import { campaignRepo } from "@/lib/campaigns/repository";
import { requirePermission } from "@/lib/permissions";
import { revokeAuthorization, saveAuthorization, vnDate } from "@/lib/ads/authorization";
import { activateAd, changeDailyBudget, createDraftFromPost, parseAudience, pauseAd, proposeFromVideoPosts, pushDraftToMeta } from "@/lib/ads/engine";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string) => Number(String(fd.get(k) ?? "").replace(/[^\d]/g, ""));
const fail = (msg: string): never => done("/ads?tone=error", msg);

export async function approveAd(fd: FormData) {
  const actor = await requirePermission("manager", "/ads");
  const r = await activateAd(str(fd, "id"), actor.name);
  if (!r.ok) return fail(r.error);
  done("/ads", r.message);
}

export async function rejectAd(fd: FormData) {
  const actor = await requirePermission("manager", "/ads");
  const id = str(fd, "id");
  const db = getDb();
  const ad = db.select().from(schema.adCampaigns).where(eq(schema.adCampaigns.id, id)).get();
  if (!ad) return fail("Không tìm thấy quảng cáo");
  if (ad.status === "active") return fail("Quảng cáo đang chạy: tạm dừng trước khi từ chối");
  db.update(schema.adCampaigns).set({ status: "rejected" }).where(eq(schema.adCampaigns.id, id)).run();
  campaignRepo.syncEntityStatus("ad", id, "rejected");
  logActivity("human", `${actor.name} từ chối quảng cáo “${ad.name}”.`, "ads");
  done("/ads", "Đã từ chối");
}

export async function toggleAd(fd: FormData) {
  const actor = await requirePermission("manager", "/ads");
  const id = str(fd, "id");
  const ad = getDb().select().from(schema.adCampaigns).where(eq(schema.adCampaigns.id, id)).get();
  if (!ad) return fail("Không tìm thấy quảng cáo");
  // Bật lại cũng là quyết định tiêu tiền: qua cùng cổng ủy quyền như khi duyệt.
  const r = ad.status === "active" ? await pauseAd(id, actor.name) : await activateAd(id, actor.name);
  if (!r.ok) return fail(r.error);
  done("/ads", r.message);
}

export async function updateBudget(fd: FormData) {
  const actor = await requirePermission("manager", "/ads");
  const r = await changeDailyBudget(str(fd, "id"), num(fd, "dailyBudget"), actor.name);
  if (!r.ok) return fail(r.error);
  done("/ads", r.message);
}

export async function submitAdForApproval(fd: FormData) {
  const actor = await requirePermission("manager", "/ads");
  const id = str(fd, "id");
  const ad = getDb().select().from(schema.adCampaigns).where(eq(schema.adCampaigns.id, id)).get();
  if (!ad || ad.status !== "proposed") return fail("Chỉ gửi duyệt được đề xuất");
  getDb().update(schema.adCampaigns).set({ status: "pending_approval" }).where(eq(schema.adCampaigns.id, id)).run();
  campaignRepo.syncEntityStatus("ad", id, "pending_approval");
  logActivity("human", `${actor.name} đưa đề xuất “${ad.name}” vào chờ duyệt.`, "ads");
  done("/ads", "Đã đưa vào chờ duyệt");
}

export async function createAdDraftAction(fd: FormData) {
  const actor = await requirePermission("manager", "/ads");
  const audience = parseAudience(JSON.stringify({ countries: str(fd, "countries").split(/[,\s]+/).filter(Boolean).map((c) => c.toUpperCase()), ageMin: num(fd, "ageMin"), ageMax: num(fd, "ageMax"), genders: fd.getAll("gender").map(Number) }));
  const r = createDraftFromPost({ postId: str(fd, "postId"), dailyBudget: num(fd, "dailyBudget"), days: num(fd, "days"), audience, by: actor.name });
  if (!r.ok) return fail(r.error);
  done("/ads", `${r.message}. Chưa tiêu tiền.`);
}

export async function pushAdToMetaAction(fd: FormData) {
  await requirePermission("manager", "/ads");
  const r = await pushDraftToMeta(str(fd, "id"));
  if (!r.ok) return fail(r.error);
  done("/ads", r.message);
}

export async function proposeAdsAction() {
  await requirePermission("manager", "/ads");
  const n = proposeFromVideoPosts();
  done("/ads", n ? `Đã đề xuất ${n} quảng cáo từ video có lượt xem tốt` : "Chưa có video đã đăng nào đạt ngưỡng đề xuất");
}

/** OWNER đặt ủy quyền ngân sách: trần ngày, trần tháng, hạn, tài khoản quảng cáo, có cho AI tự tăng trong trần không. */
export async function saveAdAuthorization(fd: FormData) {
  const actor = await requirePermission("admin", "/ads");
  const validUntil = str(fd, "validUntil");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(validUntil) || validUntil < vnDate()) return fail("Hạn ủy quyền phải là ngày từ hôm nay trở đi");
  const monthly = num(fd, "monthlyCap");
  const daily = num(fd, "dailyCap");
  if (!(monthly > 0 && daily > 0 && daily <= monthly)) return fail("Trần ngày và trần tháng phải lớn hơn 0, trần ngày không vượt trần tháng");
  const adAccountId = str(fd, "adAccountId");
  if (adAccountId && !adAccountId.startsWith("act_")) return fail("Tài khoản quảng cáo phải có dạng act_…");
  saveAuthorization({ monthlyCapVnd: monthly, dailyCapVnd: daily, validUntil, adAccountId, autoPauseCplAbove: num(fd, "autoPauseCplAbove") || 60000, allowAutoScale: fd.get("allowAutoScale") === "1", authorizedBy: actor.name, authorizedAt: nowIso(), note: str(fd, "note").slice(0, 300) });
  setSetting("ads.autoPauseCplAbove", String(num(fd, "autoPauseCplAbove") || 60000));
  logActivity("human", `${actor.name} ủy quyền ngân sách quảng cáo: ${daily.toLocaleString("vi-VN")} ₫/ngày, ${monthly.toLocaleString("vi-VN")} ₫/tháng, tới ${validUntil}${fd.get("allowAutoScale") === "1" ? ", cho AI tự tăng trong trần" : ""}.`, "ads");
  done("/ads", "Đã lưu ủy quyền ngân sách");
}

export async function revokeAdAuthorization() {
  const actor = await requirePermission("admin", "/ads");
  revokeAuthorization();
  // Hết ủy quyền = không còn chi tiêu nào được phép: dừng mọi quảng cáo đang chạy.
  const running = getDb().select().from(schema.adCampaigns).where(eq(schema.adCampaigns.status, "active")).all();
  const failed: string[] = [];
  for (const ad of running) {
    const r = await pauseAd(ad.id, actor.name, "Dừng vì OWNER thu hồi ủy quyền ngân sách");
    if (!r.ok) failed.push(`${ad.name}: ${r.error}`);
  }
  logActivity("human", `${actor.name} thu hồi ủy quyền ngân sách quảng cáo; dừng ${running.length - failed.length}/${running.length} quảng cáo đang chạy.`, "ads");
  if (failed.length) return fail(`Đã thu hồi ủy quyền nhưng chưa dừng được: ${failed.join("; ")}. Dừng tay trong Trình quản lý quảng cáo.`);
  done("/ads", `Đã thu hồi ủy quyền và dừng ${running.length} quảng cáo đang chạy.`);
}

export async function retryPost(fd: FormData) {
  await requirePermission("manager", "/publishing");
  const id = str(fd, "id");
  const post = getDb().select().from(schema.scheduledPosts).where(eq(schema.scheduledPosts.id, id)).get();
  if (!post) return done("/publishing?tone=error", "Không tìm thấy bài");
  // Bài video có luật thử lại riêng (không đăng lại khi nền tảng đã nhận video): đi qua src/lib/publishing/video.ts.
  if (post.videoId) return done("/publishing?tone=error", "Bài video: dùng nút Thử lại ở mục Bài video.");
  if (post.status !== "failed") return done("/publishing?tone=error", "Chỉ thử lại bài lỗi.");
  getDb().update(schema.scheduledPosts).set({ status: "scheduled", error: null }).where(eq(schema.scheduledPosts.id, id)).run();
  done("/publishing", "Đã xếp đăng lại");
}
