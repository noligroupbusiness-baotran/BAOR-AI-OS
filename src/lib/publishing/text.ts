// Bài CHỮ (lên lịch từ Nội dung): cùng cổng với bài video (src/lib/publishing/video.ts).
// LÊN LỊCH → (chế độ thử: dựng đủ, không gọi nền tảng) → GIÀNH QUYỀN NGUYÊN TỬ → ĐĂNG → XÁC MINH (đọc lại bài) → "Đã đăng".
// Luật: chế độ thử bật mặc định; một nội dung một bài mỗi trang (dedupe_key + chống trùng theo Page ID); lỗi mơ hồ (lệnh đăng đã gửi,
// không rõ kết quả) không tự đăng lại; bài quá hạn / bài mẫu không bao giờ tự đăng.
import { and, eq, inArray, isNull, lte } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { logActivity } from "@/lib/activity";
import { sendAlert } from "@/lib/alerts";
import { campaignRepo } from "@/lib/campaigns/repository";
import { connectorContext, finishRun, startRun } from "@/lib/connectors/config";
import { connectorFor } from "@/lib/connectors/registry";
import type { PublishResult } from "@/lib/connectors/types";
import { kindOf } from "@/lib/content/formats";
import { getAutomation } from "@/lib/queries";
import { recordDecision } from "@/lib/router";
import { AMBIGUOUS_MARK, SAMPLE_NOTE, inFlight, isAmbiguousFailure, isDryRun, isSamplePost, ambiguousRetryBlock, parseRescheduleWhen, previousExternalId, recoverStuckPublishing, releaseContentIfIdle, sweepOverduePosts } from "./guards";
import { cancelPostRow, channelPageId, describeBlockers, overdueOnSamePage, pageBlockersAmong } from "./video";

/** Kênh nhận bài CHỮ và khoá kết nối của kênh. TikTok / YouTube chỉ nhận video, Instagram cần ảnh / video → không nhận bài chữ. */
export const TEXT_PLATFORMS: Record<string, { key: string; label: string }> = {
  facebook: { key: "facebook_page", label: "Facebook" },
  zalo: { key: "zalo_oa", label: "Zalo OA" },
};

/** Kênh bài chữ ĐĂNG ĐƯỢC NGAY (có connector đăng bài). Zalo OA chưa có adapter → không chọn được cho tới khi có. */
export function textPlatforms(): [string, { key: string; label: string }][] {
  return Object.entries(TEXT_PLATFORMS).filter(([, ch]) => !!connectorFor(ch.key)?.publish);
}

/** Kênh có nhận bài chữ không (null = được). */
function textPlatformBlock(platform: string): string | null {
  const ch = TEXT_PLATFORMS[platform];
  if (!ch) return `${NOT_TEXT[platform] ?? `Kênh ${platform} không hỗ trợ`}: bài chữ không đăng lên kênh này.`;
  if (!connectorFor(ch.key)?.publish) return `${ch.label}: chưa có kết nối đăng bài — chưa lên lịch được.`;
  return null;
}

/** Kênh không nhận bài chữ: lý do ngắn hiện cho người lên lịch. */
const NOT_TEXT: Record<string, string> = {
  tiktok: "TikTok chỉ nhận video",
  youtube: "YouTube chỉ nhận video",
  instagram: "Instagram cần ảnh hoặc video",
};

/** Lệch đồng hồ cho phép khi chọn "bây giờ" (giờ đã qua quá mức này bị từ chối). */
const PAST_GRACE_MS = 60_000;

const nowIso = () => new Date().toISOString();
const newId = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const dedupeKeyFor = (platform: string, contentId: string) => `${platform}:ct:${contentId}`;

type PostRow = typeof schema.scheduledPosts.$inferSelect;

function textPostsFor(contentId: string): PostRow[] {
  return getDb()
    .select()
    .from(schema.scheduledPosts)
    .where(and(eq(schema.scheduledPosts.contentId, contentId), isNull(schema.scheduledPosts.videoId)))
    .all();
}

/** Giờ sớm nhất chọn được trong ô datetime-local (giờ VN, "YYYY-MM-DDTHH:mm"): bây giờ. */
export function minScheduleLocal(now = Date.now()): string {
  return new Date(now + 7 * 3_600_000).toISOString().slice(0, 16);
}

/** Nhãn ngắn của textScheduleBlock (giao diện ít chữ; câu đầy đủ trong nút (i)). */
export function textScheduleBlockShort(format: string): string | null {
  const kind = kindOf(format);
  if (kind === "script") return "Kịch bản video · đăng ở Kho video";
  if (kind === "image") return "Bài ảnh · chưa đăng tự động";
  return null;
}

/** Kiểu nội dung có đăng thành bài chữ được không (null = được). */
export function textScheduleBlock(format: string): string | null {
  const kind = kindOf(format);
  if (kind === "script") return "Kịch bản video (Reel / Story) không đăng thành bài chữ: quay xong, duyệt ở Video Studio rồi lên lịch ở Kho video.";
  if (kind === "image") return "Bài hình ảnh: hệ thống chưa đăng kèm ảnh — không lên lịch để tránh đăng thiếu ảnh.";
  return null;
}

export type TextScheduleResult = { ok: true; created: number; mode: "live" | "dry_run" } | { ok: false; error: string };

export function scheduleTextPosts(input: { contentId: string; platforms: string[]; whenIso: string; by: string }): TextScheduleResult {
  const db = getDb();
  const item = db.select().from(schema.contentItems).where(eq(schema.contentItems.id, input.contentId)).get();
  if (!item) return { ok: false, error: "Không tìm thấy nội dung" };
  if (item.status !== "approved" && item.status !== "scheduled") return { ok: false, error: "Chỉ lên lịch được nội dung đã duyệt." };
  const block = textScheduleBlock(item.format);
  if (block) return { ok: false, error: block };
  if (isSamplePost({ id: "", contentId: item.id })) return { ok: false, error: "Nội dung mẫu (dữ liệu demo): không lên lịch đăng." };
  const platforms = [...new Set(input.platforms)];
  if (!platforms.length) return { ok: false, error: "Chọn ít nhất một kênh" };
  for (const p of platforms) {
    const pb = textPlatformBlock(p);
    if (pb) return { ok: false, error: pb };
  }
  const when = Date.parse(input.whenIso);
  if (!Number.isFinite(when)) return { ok: false, error: "Giờ đăng không hợp lệ" };
  if (when < Date.now() - PAST_GRACE_MS) return { ok: false, error: "Giờ đăng đã qua: chọn giờ từ bây giờ trở đi." };
  const dry = isDryRun();
  // Chống trùng theo TRANG ĐÍCH (cùng luật bài video): bài thật còn sống / đã gửi lệnh đăng / lỗi mơ hồ chặn tạo bài mới.
  const live = pageBlockersAmong(textPostsFor(item.id), platforms, dry);
  if (dry && live.length) return { ok: false, error: `Nội dung đã có bài thử đang chờ trên ${describeBlockers(live, platforms)}. Không tạo bài trùng.` };
  if (!dry && live.some((e) => isAmbiguousFailure(e)))
    return { ok: false, error: `Bài trên ${describeBlockers(live.filter((e) => isAmbiguousFailure(e)), platforms)} lỗi mơ hồ, có thể đã lên trang. Kiểm tra trang rồi dùng “Đăng lại” ở Đăng bài (ghi đã kiểm tra), không lên lịch mới.` };
  if (!dry && live.length) return { ok: false, error: `Nội dung đã có bài trên ${describeBlockers(live, platforms)} (${live.map((e) => e.status).join(", ")}). Không đăng trùng.` };
  const keys = platforms.map((p) => dedupeKeyFor(p, item.id));
  const existing = dry ? [] : db.select().from(schema.scheduledPosts).where(inArray(schema.scheduledPosts.dedupeKey, keys)).all();
  const holders = existing.filter((x) => x.externalId || !["failed", "cancelled", "overdue"].includes(x.status));
  if (holders.length) return { ok: false, error: `Kênh ${holders.map((x) => `${x.platform} đã có bài này (${x.status})`).join("; ")}. Không đăng trùng.` };
  const iso = new Date(when).toISOString();
  const rows = platforms.map((p) => ({
    id: newId("sp"),
    contentId: item.id,
    title: item.title,
    platform: p,
    scheduledFor: iso,
    status: "scheduled",
    mode: dry ? "dry_run" : "live",
    dedupeKey: dry ? null : dedupeKeyFor(p, item.id),
    targetPageId: channelPageId(p),
  }));
  db.transaction((tx) => {
    if (!dry) for (const e of existing) tx.update(schema.scheduledPosts).set({ dedupeKey: null }).where(eq(schema.scheduledPosts.id, e.id)).run();
    // Bài quá hạn cũ cùng nội dung + cùng trang đã được thay bằng bài mới → huỷ (không còn treo "cần xếp lại")
    for (const e of overdueOnSamePage(textPostsFor(item.id), platforms)) tx.update(schema.scheduledPosts).set({ status: "cancelled", dedupeKey: null, error: "Đã thay bằng bài lên lịch mới." }).where(eq(schema.scheduledPosts.id, e.id)).run();
    tx.insert(schema.scheduledPosts).values(rows).run();
    tx.update(schema.contentItems).set({ status: "scheduled", scheduledFor: iso }).where(eq(schema.contentItems.id, item.id)).run();
  });
  campaignRepo.syncEntityStatus("content", item.id, "scheduled");
  for (const r of rows) campaignRepo.inheritLinks("content", item.id, "publication", r.id, "scheduled");
  logActivity("human", `${input.by} lên lịch “${item.title}” trên ${platforms.length} kênh${dry ? " (chế độ thử, không đăng thật)" : ""}.`, "publishing");
  return { ok: true, created: rows.length, mode: dry ? "dry_run" : "live" };
}

/** Điều kiện đăng một bài chữ (không ghi gì). */
function textGate(post: PostRow, content: typeof schema.contentItems.$inferSelect | undefined): { ok: true; key: string } | { ok: false; reason: string } {
  if (!content || !["approved", "scheduled", "published"].includes(content.status)) return { ok: false, reason: "Nội dung chưa được phê duyệt." };
  const block = textScheduleBlock(content.format);
  if (block) return { ok: false, reason: block };
  const ch = TEXT_PLATFORMS[post.platform];
  if (!ch) return { ok: false, reason: `${NOT_TEXT[post.platform] ?? `Kênh ${post.platform} không hỗ trợ`}: không đăng bài chữ.` };
  if (!connectorFor(ch.key)?.publish) return { ok: false, reason: `Chưa có connector đăng bài cho ${ch.label}.` };
  const integration = getDb().select().from(schema.integrations).where(eq(schema.integrations.key, ch.key)).get();
  if (!integration?.connected) return { ok: false, reason: `Tài khoản ${integration?.name ?? ch.label} chưa kết nối.` };
  return { ok: true, key: ch.key };
}

/** Bộ chạy nền gọi mỗi phút. */
export async function publishDueTextPosts(): Promise<{ published: number; tested: number; failed: number; skipped: number }> {
  const db = getDb();
  const out = { published: 0, tested: 0, failed: 0, skipped: 0 };
  recoverStuckPublishing();
  sweepOverduePosts();
  if (getAutomation().auto_publish === false) return out;
  // Ghi chú lý do chỉ khi đổi (chạy mỗi phút: không ghi lại, không thêm quyết định mới cho cùng lý do)
  const note = (post: PostRow, msg: string): boolean => {
    if (post.error === msg) return false;
    db.update(schema.scheduledPosts).set({ error: msg }).where(eq(schema.scheduledPosts.id, post.id)).run();
    return true;
  };
  const due = db
    .select()
    .from(schema.scheduledPosts)
    .where(and(eq(schema.scheduledPosts.status, "scheduled"), lte(schema.scheduledPosts.scheduledFor, nowIso())))
    .all()
    .filter((p) => !p.videoId);
  for (const post of due) {
    if (isSamplePost(post)) {
      note(post, SAMPLE_NOTE);
      out.skipped++;
      continue;
    }
    const content = db.select().from(schema.contentItems).where(eq(schema.contentItems.id, post.contentId)).get();
    const message = content?.draft || `${post.title}\n\n${content?.hook ?? ""}`.trim();
    const gate = textGate(post, content);
    if (post.mode === "dry_run") {
      if (!gate.ok && !/chưa kết nối/.test(gate.reason)) {
        note(post, gate.reason);
        out.skipped++;
        continue;
      }
      const r = db
        .update(schema.scheduledPosts)
        .set({ status: "dry_run", error: `Chế độ thử: đủ điều kiện đăng (${message.length} ký tự${gate.ok ? "" : ", kênh chưa kết nối"}). Không gọi ${post.platform}.` })
        .where(and(eq(schema.scheduledPosts.id, post.id), eq(schema.scheduledPosts.status, "scheduled")))
        .run();
      if (r.changes) {
        releaseContentIfIdle(post.contentId);
        logActivity("system", `Chế độ thử: “${post.title}” đủ điều kiện đăng ${post.platform}, không đăng thật.`, "publishing");
        out.tested++;
      }
      continue;
    }
    // Công tắc chế độ thử: đang bật thì không gọi nền tảng, kể cả bài đã lên lịch đăng thật từ trước (giữ lại, không đăng).
    if (isDryRun()) {
      note(post, "Chế độ thử đang bật: bài đăng thật được giữ lại, chưa gọi nền tảng.");
      out.skipped++;
      continue;
    }
    if (!gate.ok) {
      // Không có kết nối thì giữ nguyên "chờ đăng" và ghi lý do (một lần mỗi khi lý do đổi), không đánh dấu lỗi để khỏi spam.
      if (note(post, gate.reason)) recordDecision({ lane: "rule", domain: "publish", subject: `Đăng “${post.title}” lên ${post.platform}`, entityType: "publication", entityId: post.id, outcome: "chặn", reason: gate.reason, needsApproval: false });
      out.skipped++;
      continue;
    }
    // Bài chữ cũ (trước khi có dedupe_key) có thể trùng: nội dung đã có bài ĐÃ GỬI lệnh đăng lên cùng trang → không đăng thêm.
    const sent = pageBlockersAmong(textPostsFor(post.contentId), [post.platform], false, post.id).filter((e) => e.status !== "scheduled");
    if (sent.length) {
      db.update(schema.scheduledPosts).set({ status: "cancelled", dedupeKey: null, error: `Trùng: nội dung đã có bài trên ${describeBlockers(sent, [post.platform])} (${sent.map((e) => e.status).join(", ")}). Không đăng trùng.` }).where(and(eq(schema.scheduledPosts.id, post.id), eq(schema.scheduledPosts.status, "scheduled"))).run();
      out.skipped++;
      continue;
    }
    // Giành quyền đăng nguyên tử: hai lượt chạy chồng nhau không cùng đăng một bài.
    const claim = db
      .update(schema.scheduledPosts)
      .set({ status: "publishing", attempts: post.attempts + 1, targetPageId: channelPageId(post.platform) ?? post.targetPageId })
      .where(and(eq(schema.scheduledPosts.id, post.id), eq(schema.scheduledPosts.status, "scheduled")))
      .run();
    if (claim.changes !== 1) continue;
    recordDecision({ lane: "rule", domain: "publish", subject: `Đăng “${post.title}” lên ${post.platform}`, entityType: "publication", entityId: post.id, outcome: "cho phép", reason: "Đủ điều kiện đăng.", needsApproval: false });
    inFlight.add(post.id);
    const runId = startRun(gate.key, "publish");
    try {
      let res: PublishResult;
      try {
        res = await connectorFor(gate.key)!.publish!(connectorContext(gate.key), { postId: post.id, contentId: post.contentId, title: post.title, message, platform: post.platform });
      } catch (e) {
        res = { ok: false, ambiguous: true, message: `Lỗi khi gửi lệnh đăng (${e instanceof Error ? e.message : e}). Kiểm tra trang trước khi thử lại.` };
      }
      if (res.ok && res.externalId) {
        // Nền tảng trả mã bài: CHƯA là "đã đăng" — verifyPublishingPosts đọc lại bài rồi mới chuyển.
        db.update(schema.scheduledPosts).set({ status: "verifying", externalId: res.externalId, error: null, publishedAt: nowIso() }).where(eq(schema.scheduledPosts.id, post.id)).run();
        logActivity("system", `${post.platform} nhận “${post.title}” (mã ${res.externalId}), đang xác minh.`, "publishing");
        finishRun(runId, true, res.message, 1);
        out.published++;
      } else {
        const ambiguous = res.ambiguous || res.ok;
        const msg = res.ok ? "Nền tảng báo đã nhận nhưng không trả mã bài. Kiểm tra trang trước khi thử lại." : res.message;
        db.update(schema.scheduledPosts).set({ status: "failed", error: ambiguous ? `${AMBIGUOUS_MARK} ${msg}` : msg }).where(eq(schema.scheduledPosts.id, post.id)).run();
        logActivity("system", `Đăng “${post.title}” thất bại: ${msg}`, "publishing");
        finishRun(runId, false, msg);
        out.failed++;
        void sendAlert({ level: "error", title: `Đăng bài lỗi: ${post.title}`, text: msg, href: "/publishing" });
      }
    } finally {
      inFlight.delete(post.id);
    }
  }
  return out;
}

/** "Đăng lại" bài chữ lỗi (đăng ở lượt chạy tới) / "Xếp lại" bài quá hạn (bắt buộc chọn giờ mới). Nền tảng đã nhận bài (có mã) → không.
 *  Lỗi mơ hồ → chỉ khi người ghi đã kiểm tra trang. */
export function retryTextPost(postId: string, checkedNote?: string, whenIso?: string, by?: { email: string; name?: string }): { ok: boolean; error?: string } {
  const db = getDb();
  const p = db.select().from(schema.scheduledPosts).where(eq(schema.scheduledPosts.id, postId)).get();
  if (!p) return { ok: false, error: "Không tìm thấy bài" };
  if (p.videoId) return { ok: false, error: "Bài video: dùng nút Thử lại ở mục Bài video." };
  if (p.status !== "failed" && p.status !== "overdue") return { ok: false, error: "Chỉ đăng lại bài lỗi hoặc quá hạn." };
  if (isSamplePost(p)) return { ok: false, error: SAMPLE_NOTE };
  if (p.externalId) return { ok: false, error: `Nền tảng đã nhận bài (mã ${p.externalId}). Kiểm tra trang, không đăng lại để tránh trùng.` };
  const amb = ambiguousRetryBlock(p, checkedNote, by);
  if (amb) return { ok: false, error: amb };
  const pb = textPlatformBlock(p.platform);
  if (pb) return { ok: false, error: pb };
  let at = nowIso();
  if (p.status === "overdue") {
    const w = parseRescheduleWhen(whenIso);
    if (!w.ok) return { ok: false, error: w.error };
    at = w.iso;
  }
  const content = db.select().from(schema.contentItems).where(eq(schema.contentItems.id, p.contentId)).get();
  if (!content || !["approved", "scheduled"].includes(content.status)) return { ok: false, error: "Nội dung không còn ở trạng thái đã duyệt." };
  const twins = pageBlockersAmong(textPostsFor(p.contentId), [p.platform], p.mode === "dry_run", p.id);
  if (twins.length) return { ok: false, error: `Nội dung đã có bài trên ${describeBlockers(twins, [p.platform])} (${twins.map((e) => e.status).join(", ")}). Không đăng trùng.` };
  // Khoá chống trùng: bài thật lấy lại khoá của kênh nếu khoá đang trống
  let dedupeKey = p.dedupeKey;
  if (p.mode !== "dry_run" && !dedupeKey) {
    const k = dedupeKeyFor(p.platform, p.contentId);
    const holder = db.select().from(schema.scheduledPosts).where(eq(schema.scheduledPosts.dedupeKey, k)).get();
    if (!holder) dedupeKey = k;
  }
  // Mã bài cũ (OWNER kiểm "Không thấy bài") giữ trong ghi chú + nhật ký: còn tra / xoá bài thứ nhất nếu nhìn nhầm
  const oldId = previousExternalId(p);
  db.update(schema.scheduledPosts).set({ status: "scheduled", scheduledFor: at, error: oldId ? `Đăng lại sau kiểm trang — mã bài cũ ${oldId}.` : null, dedupeKey }).where(eq(schema.scheduledPosts.id, postId)).run();
  if (oldId || isAmbiguousFailure(p)) logActivity("human", `${by?.name ?? by?.email ?? "Người dùng"} đăng lại bài lỗi “${p.title}” trên ${p.platform}${oldId ? ` (mã bài cũ ${oldId})` : ""}${checkedNote?.trim() ? `; đã kiểm trang: ${checkedNote.trim().slice(0, 120)}` : ""}.`, "publishing");
  if (content.status === "approved") db.update(schema.contentItems).set({ status: "scheduled" }).where(eq(schema.contentItems.id, content.id)).run();
  campaignRepo.syncEntityStatus("publication", postId, "scheduled");
  logActivity("human", `Xếp đăng lại “${p.title}” trên ${p.platform}${checkedNote?.trim() ? ` (đã kiểm tra trang: ${checkedNote.trim().slice(0, 120)})` : ""}.`, "publishing");
  return { ok: true };
}

/** Huỷ bài chữ chờ đăng / quá hạn / lỗi rõ ràng. Nội dung không còn bài nào chờ thì về "Đã duyệt". */
export function cancelTextPost(postId: string, by?: { email: string; name?: string }): { ok: boolean; error?: string } {
  const p = getDb().select().from(schema.scheduledPosts).where(eq(schema.scheduledPosts.id, postId)).get();
  if (!p || p.videoId) return { ok: false, error: "Không tìm thấy bài" };
  const r = cancelPostRow(p, by);
  if (r.ok) releaseContentIfIdle(p.contentId);
  return r;
}
