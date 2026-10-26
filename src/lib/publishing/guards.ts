// Cổng chung cho MỌI bài đăng (bài chữ và bài video): chế độ thử, bài mẫu, bài quá hạn, bài kẹt "đang đăng", lỗi mơ hồ.
// Bài chữ (src/lib/publishing/text.ts) và bài video (src/lib/publishing/video.ts) đi qua cùng các luật này.
import { and, eq, inArray, lt } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getSetting, isAdminEmail, setSetting } from "@/lib/admin";
import { logActivity } from "@/lib/activity";
import { campaignRepo } from "@/lib/campaigns/repository";
import { isSamplePost } from "@/lib/sample";

/** Bài mẫu: MỘT danh sách ID mẫu duy nhất (src/lib/sample.ts — cùng danh sách "Xoá dữ liệu mẫu" dùng). */
export { isSamplePost };

/** Chế độ thử bật mặc định (§7): chỉ tắt khi OWNER đặt publishing.dryRun = "0". */
export function isDryRun(): boolean {
  return getSetting("publishing.dryRun") !== "0";
}

/** Bật / tắt chế độ thử. TẮT = đăng thật = điểm dừng của OWNER (§7): chỉ tài khoản quản trị chính; BẬT lại thì ai có quyền gọi cũng được. */
export function setDryRunMode(on: boolean, actor: { email: string; name?: string }): { ok: true } | { ok: false; error: string } {
  if (!on && !isAdminEmail(actor.email)) return { ok: false, error: "Chỉ OWNER (tài khoản quản trị chính) tắt được chế độ thử." };
  setSetting("publishing.dryRun", on ? "1" : "0");
  logActivity("human", `${actor.name ?? actor.email} ${on ? "bật" : "tắt"} chế độ thử đăng bài (${on ? "không đăng thật" : "đăng thật khi đã kết nối"}).`, "publishing");
  return { ok: true };
}

/** Đánh dấu lỗi mơ hồ (lệnh đăng đã gửi, không rõ bài đã lên chưa): đăng lại phải có xác nhận đã kiểm tra trang. */
export const AMBIGUOUS_MARK = "[CẦN KIỂM TRA TRANG]";

/** Lỗi mơ hồ = bài CÓ THỂ đã lên trang mà chưa ai kiểm: lệnh đăng đã gửi không rõ kết quả, hoặc xác minh bỏ cuộc sau 24 giờ
 *  (nền tảng đã nhận lệnh, kể cả khi bài thiếu mã). Luật chung: đăng lại chỉ OWNER kèm ghi chú đã kiểm trang; chặn bài anh em
 *  cùng trang (pageBlockersAmong). */
export function isAmbiguousFailure(p: { status: string; error: string | null }): boolean {
  const e = p.error ?? "";
  return p.status === "failed" && (e.startsWith(AMBIGUOUS_MARK) || e.startsWith(VERIFY_GIVE_UP_PREFIX));
}

/** Lỗi xác minh quá 24 giờ (verifyPublishingPosts): nền tảng đã nhận nhưng đọc lại không được. */
export const VERIFY_GIVE_UP_PREFIX = "Không xác minh được sau 24 giờ";

/** Kiểm lúc gửi (claimForSend): Page ID kênh khác trang đã lưu lúc lên lịch → không gửi lệnh đăng. */
export const PAGE_CHANGED_PREFIX = "Page ID đã đổi — kiểm lại kênh";

/** Nhãn lỗi ngắn (giao diện ít chữ); câu đầy đủ để ở chú thích khi rê chuột. Bỏ dấu ":" / "—" treo ở cuối vế đầu. */
export function postErrorShort(p: { status: string; error: string | null; externalId: string | null }): string | null {
  if (!p.error) return null;
  if (needsPageCheck(p)) return "Cần kiểm trang";
  const first = p.error.split(/(?<=[.:])\s/)[0].replace(/\s*[:—-]+\s*$/, "");
  return first.length > 60 ? `${first.slice(0, 57)}…` : first;
}

/** Bài lỗi SAU khi nền tảng có thể đã nhận bài (có mã bài / lỗi mơ hồ / xác minh quá hạn): cần OWNER mở trang kiểm. */
export function needsPageCheck(p: { status: string; error: string | null; externalId: string | null }): boolean {
  if (p.status !== "failed") return false;
  const e = p.error ?? "";
  return !!p.externalId || e.startsWith(AMBIGUOUS_MARK) || e.startsWith(VERIFY_GIVE_UP_PREFIX);
}

/** Đăng lại bài lỗi MƠ HỒ (lệnh đăng đã gửi, có thể đã lên trang): CHỈ OWNER, kèm ghi chú đã kiểm tra trang. null = được. */
export function ambiguousRetryBlock(p: { status: string; error: string | null }, checkedNote: string | undefined, by: { email: string } | undefined): string | null {
  if (!isAmbiguousFailure(p)) return null;
  if (!isAdminEmail(by?.email)) return "Bài có thể đã lên trang: chỉ OWNER đăng lại được (hoặc Huỷ bài này).";
  if ((checkedNote ?? "").trim().length < 10) return "Lần trước lệnh đăng đã gửi nhưng không rõ kết quả: kiểm tra trang trước, rồi ghi xác nhận (vd 'Đã mở trang lúc 10:05, không thấy bài').";
  return null;
}

/** Mã bài cũ trên nền tảng (bài OWNER đã kiểm "Không thấy bài" giữ mã trong ghi chú) — để còn tra / xoá bài thứ nhất nếu nhìn nhầm. */
export function previousExternalId(p: { externalId: string | null; error: string | null }): string | null {
  return p.externalId ?? (p.error ?? "").match(/mã cũ ([^\s)]+)/)?.[1] ?? null;
}

/** Giờ đăng mới khi "Xếp lại" bài quá hạn: phải chọn, không được ở quá khứ. */
export function parseRescheduleWhen(whenIso: string | undefined, now = Date.now()): { ok: true; iso: string } | { ok: false; error: string } {
  const t = Date.parse(whenIso ?? "");
  if (!Number.isFinite(t)) return { ok: false, error: "Chọn giờ đăng mới cho bài quá hạn." };
  if (t < now - 60_000) return { ok: false, error: "Giờ đăng đã qua: chọn giờ từ bây giờ trở đi." };
  return { ok: true, iso: new Date(t).toISOString() };
}

/** Bài đang được tiến trình này gửi lệnh đăng (chung cho bài chữ và video): bài "publishing" ngoài tập này là bài kẹt. */
const g = globalThis as unknown as { __baorPublishing?: Set<string> };
export const inFlight = (g.__baorPublishing ??= new Set<string>());

/** Bài quá giờ hẹn hơn mức này thì KHÔNG tự đăng (vd bài từ tháng 9 khi vừa nối Facebook): chuyển "Quá hạn, cần xếp lại". */
export const OVERDUE_AFTER_MS = 6 * 60 * 60 * 1000;

export const SAMPLE_NOTE = "Bài mẫu (dữ liệu demo): không bao giờ đăng thật.";

/** Máy chủ dừng giữa lúc đăng: bài kẹt "publishing" (không thuộc lượt đang chạy) → lỗi MƠ HỒ, không tự đăng lại (có thể đã lên). */
export function recoverStuckPublishing(): number {
  const db = getDb();
  let n = 0;
  for (const p of db.select().from(schema.scheduledPosts).where(eq(schema.scheduledPosts.status, "publishing")).all()) {
    if (inFlight.has(p.id)) continue;
    const r = db
      .update(schema.scheduledPosts)
      .set({ status: "failed", error: `${AMBIGUOUS_MARK} Máy chủ dừng giữa lúc đăng. Kiểm tra trang trước khi thử lại để tránh đăng trùng.` })
      .where(and(eq(schema.scheduledPosts.id, p.id), eq(schema.scheduledPosts.status, "publishing")))
      .run();
    n += r.changes;
  }
  return n;
}

/** Nội dung chữ "Đã lên lịch" mà không còn bài nào đang chờ / đang đăng / đang xác minh (bài quá hạn, bài thử đã chạy) → về "Đã duyệt"
 *  để lên lịch lại được ở Nội dung. */
export function releaseContentIfIdle(contentId: string | null): void {
  if (!contentId) return;
  const db = getDb();
  const pending = db.select({ id: schema.scheduledPosts.id }).from(schema.scheduledPosts).where(and(eq(schema.scheduledPosts.contentId, contentId), inArray(schema.scheduledPosts.status, ["scheduled", "publishing", "verifying"]))).all();
  if (!pending.length) db.update(schema.contentItems).set({ status: "approved" }).where(and(eq(schema.contentItems.id, contentId), eq(schema.contentItems.status, "scheduled"))).run();
}

/** Bài chờ đăng đã quá giờ hẹn hơn OVERDUE_AFTER_MS → "overdue" (Quá hạn, cần xếp lại), nhả khoá chống trùng (chưa gửi lệnh đăng).
 *  Nội dung chữ không còn bài nào đang chờ thì về "Đã duyệt" để lên lịch lại được ở Nội dung. */
export function sweepOverduePosts(now = Date.now()): number {
  const db = getDb();
  const cutoff = new Date(now - OVERDUE_AFTER_MS).toISOString();
  const rows = db.select().from(schema.scheduledPosts).where(and(eq(schema.scheduledPosts.status, "scheduled"), lt(schema.scheduledPosts.scheduledFor, cutoff))).all();
  let n = 0;
  for (const p of rows) {
    const r = db
      .update(schema.scheduledPosts)
      .set({ status: "overdue", dedupeKey: null, error: `Quá giờ hẹn hơn ${OVERDUE_AFTER_MS / 3_600_000} giờ: không tự đăng. Xếp lại giờ trước khi đăng.` })
      .where(and(eq(schema.scheduledPosts.id, p.id), eq(schema.scheduledPosts.status, "scheduled")))
      .run();
    if (!r.changes) continue;
    n++;
    campaignRepo.syncEntityStatus("publication", p.id, "overdue");
    if (!p.videoId) releaseContentIfIdle(p.contentId);
  }
  if (n) logActivity("system", `${n} bài quá giờ hẹn hơn ${OVERDUE_AFTER_MS / 3_600_000} giờ: chuyển “Quá hạn, cần xếp lại”, không tự đăng.`, "publishing");
  return n;
}
