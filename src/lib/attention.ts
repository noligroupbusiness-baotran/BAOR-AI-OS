// MỘT nguồn cho mọi con số "cần anh xử lý" (kiểm toán 26/10/2026: bốn nơi đếm lỗi ra bốn số, badge / thẻ / chuông lệch nhau).
// Tổng quan (ô Lỗi cần xử lý), Việc cần làm, chuông (nhóm Lỗi cần xử lý), sức khoẻ ở thanh trên, badge thanh bên và thẻ Hành trình
// đều đọc ở đây — cùng định nghĩa, cùng cửa sổ thời gian:
// - Lỗi = lần chạy lỗi 24 giờ qua (chưa được lần chạy thành công mới hơn cùng đối tượng đóng lại — trừ lỗi dữ liệu từng gói webhook)
//   + bài đăng lỗi + kết nối lỗi.
//   Lần chạy loại "check" tính qua trạng thái kết nối; "publish" / "publish_video" tính qua trạng thái bài (không đếm đôi).
// - Bài lỗi SAU khi nền tảng đã nhận (có mã bài / "[CẦN KIỂM TRA TRANG]" / "Không xác minh được sau 24 giờ") = "cần kiểm trang":
//   một mục mức cảnh báo, không làm sức khoẻ đỏ mãi.
// - Video cần OWNER xem = video thật (không phải mẫu), CÓ tệp, đang Chờ kiểm tra hoặc Chờ phê duyệt.
// - Bài "overdue" (quá giờ hẹn, không tự đăng) = việc OWNER xếp lại: MỘT mục trong Việc cần làm (trỏ /publishing), không phải lỗi đỏ.
// - Bài mẫu (isSamplePost — không bao giờ đăng) không vào bất kỳ số đếm nào ở đây.
// - Hook chờ chọn = hook_ideas "new" (đúng danh sách trang /content/hooks).
// - Lead cần xử lý = lead thật (không phải mẫu) ở giai đoạn "new" (Mới, chưa liên hệ) — badge menu "Lead"; không đếm hội thoại.
import { desc, eq, gte, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { isIntegrationError, listIntegrationStatus } from "@/lib/connectors/config";
import { listVideos, type VideoRecord } from "@/lib/videos/repository";
import { videos as seedVideos } from "@/lib/data/videos";
import { latestJob, videoIdsByRun, VIDEO_RUN_KEY } from "@/lib/video/jobs";
import { isSamplePost, needsPageCheck } from "@/lib/publishing/guards";
import { isSample } from "@/lib/sample";
import { WEBHOOK_CONFIG_ERRORS } from "@/lib/webhooks";

export const ATTENTION_WINDOW_MS = 24 * 3600 * 1000;

type RunRow = typeof schema.syncRuns.$inferSelect;
type PostRow = typeof schema.scheduledPosts.$inferSelect;

/** Loại lần chạy KHÔNG tính là lỗi riêng: đã có nguồn trạng thái khác (kết nối / bài đăng). */
const COUNTED_ELSEWHERE = new Set(["check", "publish", "publish_video"]);
/** Bản ghi cũ (trước 26/10) không phải lỗi: lần thử lại tự động, OWNER bấm Dừng, khởi động lại máy chủ, video đã xoá. */
const LEGACY_NOT_ERROR = /→ tự thử lại lần \d+$|^Đã dừng theo yêu cầu|^Máy chủ khởi động lại giữa lúc dựng$|^Đã xoá video/;


/** Lỗi webhook do CẤU HÌNH (khoá / chữ ký sai — hằng số chung ở src/lib/webhooks.ts, route ghi đúng câu đó): lần nhận thành công sau cùng kết nối chứng tỏ đã sửa → đóng được.
 *  Lỗi webhook KHÁC là lỗi của TỪNG gói dữ liệu (thiếu tên khách, payload không phải JSON…): gói đó đã mất (vd một lead), lần nhận ok
 *  của gói sau KHÔNG khắc phục được nó → giữ trong danh sách tới hết cửa sổ 24 giờ (kiểm toán 26/10: một lead lỗi bị che). Lỗi dữ liệu
 *  chỉ đến sau khi đã qua kiểm khoá / chữ ký, nên người lạ không spam được danh sách này. */
const closableByLaterOk = (r: RunRow) => r.kind !== "webhook" || WEBHOOK_CONFIG_ERRORS.includes(r.message);

/** Run đóng ok mà không có kết quả dựng / đồng bộ thật (jobs.ts stoppedJob, failJob khi video đã xoá). */
const NO_RESULT = /^Đã dừng theo yêu cầu|^Đã xoá video/;

export interface FailedRun extends RunRow {
  /** Video của lần dựng (lỗi dựng), để mở đúng video trong Studio. */
  videoId: string | null;
}

/** Lần chạy lỗi trong cửa sổ 24 giờ còn cần xử lý (đã bỏ phần tính ở nơi khác, lần thử lại và lỗi đã được lần sau đóng). */
export function failedRuns(now = Date.now()): FailedRun[] {
  const since = new Date(now - ATTENTION_WINDOW_MS).toISOString();
  const rows = getDb().select().from(schema.syncRuns).where(gte(schema.syncRuns.startedAt, since)).orderBy(desc(schema.syncRuns.startedAt)).all();
  const byRun = rows.some((r) => r.integrationKey === VIDEO_RUN_KEY) ? videoIdsByRun() : new Map<string, string>();
  const videoIds = new Set(getDb().select({ id: schema.videos.id }).from(schema.videos).all().map((v) => v.id));
  const subject = (r: RunRow) => (r.integrationKey === VIDEO_RUN_KEY && byRun.get(r.id) ? `video:${byRun.get(r.id)}` : `${r.integrationKey}|${r.kind}`);
  // Lần chạy thành công mới nhất của từng đối tượng: lỗi cũ hơn coi như đã khắc phục. Run "đã dừng theo yêu cầu" / "đã xoá video"
  // đóng ok nhưng KHÔNG có kết quả thật → không được đóng lỗi thật của bản trước (Dừng v2 không xoá lỗi v1).
  const lastOk = new Map<string, string>();
  for (const r of rows) {
    if (!r.ok || !r.finishedAt || NO_RESULT.test(r.message)) continue;
    const k = subject(r);
    if ((lastOk.get(k) ?? "") < r.startedAt) lastOk.set(k, r.startedAt);
  }
  const out: FailedRun[] = [];
  for (const r of rows) {
    if (r.ok || !r.finishedAt || COUNTED_ELSEWHERE.has(r.kind) || LEGACY_NOT_ERROR.test(r.message)) continue;
    if (closableByLaterOk(r) && (lastOk.get(subject(r)) ?? "") >= r.startedAt) continue;
    const videoId = r.integrationKey === VIDEO_RUN_KEY ? (byRun.get(r.id) ?? null) : null;
    if (videoId && !videoIds.has(videoId)) continue; // video đã xoá: không còn gì để xử lý
    out.push({ ...r, videoId });
  }
  return out;
}

/** Bài lỗi sau khi nền tảng có thể đã nhận video: cần OWNER mở trang kiểm, không phải lỗi đỏ vĩnh viễn. Một định nghĩa ở guards.ts
 *  (nút "Đã kiểm trang" dùng cùng luật). */
export { needsPageCheck } from "@/lib/publishing/guards";

export function postProblems(): { failed: PostRow[]; pageCheck: PostRow[]; overdue: PostRow[] } {
  const rows = getDb()
    .select()
    .from(schema.scheduledPosts)
    .where(inArray(schema.scheduledPosts.status, ["failed", "overdue"]))
    .orderBy(desc(schema.scheduledPosts.scheduledFor))
    .all()
    .filter((p) => !isSamplePost(p));
  const failed = rows.filter((p) => p.status === "failed");
  return { failed: failed.filter((p) => !needsPageCheck(p)), pageCheck: failed.filter(needsPageCheck), overdue: rows.filter((p) => p.status === "overdue") };
}

/** Bài quá hạn cần OWNER xếp lại giờ (gộp một mục). null = không có. */
export function overdueTask(): { count: number; title: string; href: string; at: string } | null {
  const rows = postProblems().overdue;
  if (!rows.length) return null;
  return { count: rows.length, title: rows.length === 1 ? `Bài “${rows[0].title}” quá hạn, cần xếp lại giờ đăng` : `${rows.length} bài quá hạn, cần xếp lại giờ đăng`, href: "/publishing", at: rows[0].scheduledFor };
}

export interface ErrorItem {
  id: string;
  source: "run" | "post" | "page_check" | "integration";
  /** "warn" = cần kiểm (không làm sức khoẻ đỏ). */
  severity: "error" | "warn";
  title: string;
  href: string;
  at: string;
}

const postHref = (p: PostRow) => (p.videoId ? `/publishing?video=${encodeURIComponent(p.videoId)}#video-posts` : "/publishing");
const postNoun = (p: PostRow) => (p.videoId ? "video" : "bài");

/** Nhãn lần chạy lỗi theo việc thật (không ghép "Webhook" + khoá kết nối). */
export function runLabel(r: Pick<RunRow, "integrationKey" | "kind" | "message">, names: Map<string, string> = new Map()): string {
  const name = names.get(r.integrationKey) ?? r.integrationKey;
  if (r.integrationKey === VIDEO_RUN_KEY) return `Dựng video “${r.kind}” lỗi: ${r.message}`;
  if (r.kind === "metrics") return `Đồng bộ số liệu ${name} lỗi: ${r.message}`;
  if (r.kind === "webhook") return `Nhận webhook ${name} lỗi: ${r.message}`;
  if (r.kind === "alert") return `Gửi cảnh báo lỗi: ${r.message}`;
  if (r.kind === "sync") return `Đồng bộ ${name} lỗi: ${r.message}`;
  if (r.kind === "publish") return `Đăng bài lên ${name} lỗi: ${r.message}`;
  if (r.kind === "publish_video") return `Đăng video lên ${name} lỗi: ${r.message}`;
  return `${name} · ${r.kind} lỗi: ${r.message}`;
}

/** Danh sách lỗi cần xử lý — đúng một danh sách cho ô Tổng quan, Việc cần làm, chuông và tình trạng hệ thống. */
export function listErrors(now = Date.now()): ErrorItem[] {
  const integrations = listIntegrationStatus();
  const names = new Map(integrations.map((i) => [i.key, i.name]));
  const items: ErrorItem[] = [];
  for (const r of failedRuns(now)) {
    items.push({ id: `run:${r.id}`, source: "run", severity: "error", title: runLabel(r, names), href: r.videoId ? `/video-studio?open=${encodeURIComponent(r.videoId)}` : "/settings#syslog", at: r.startedAt });
  }
  const posts = postProblems();
  for (const p of posts.failed) {
    items.push({ id: `spf:${p.id}`, source: "post", severity: "error", title: `Đăng ${postNoun(p)} “${p.title}” lỗi${p.error ? `: ${p.error}` : ""}`, href: postHref(p), at: p.scheduledFor });
  }
  for (const p of posts.pageCheck) {
    items.push({ id: `spchk:${p.id}`, source: "page_check", severity: "warn", title: `Cần kiểm trang: ${postNoun(p)} “${p.title}” (${p.platform}${p.externalId ? `, mã ${p.externalId}` : ""})`, href: postHref(p), at: p.scheduledFor });
  }
  for (const i of integrations) {
    if (isIntegrationError(i)) items.push({ id: `int:${i.key}`, source: "integration", severity: "error", title: `${i.name}: ${i.lastError}`, href: `/settings#${i.key}`, at: i.lastCheckedAt ?? new Date(now).toISOString() });
  }
  return items.sort((a, b) => b.at.localeCompare(a.at));
}

// ---------------------------------------------------------------- video / hook

const SAMPLE_VIDEO_IDS = new Set(seedVideos.map((v) => v.id));
export const isSampleVideo = (id: string) => SAMPLE_VIDEO_IDS.has(id);

/** Video thật cần OWNER xem: Chờ kiểm tra + Chờ phê duyệt, có tệp, không phải video mẫu. */
export function videosAwaitingOwner(all: VideoRecord[] = listVideos()): VideoRecord[] {
  return all.filter((v) => (v.status === "review" || v.status === "pending_approval") && !!v.uploadId && !isSampleVideo(v.id));
}

/** Video thật đang có bản dựng chạy / chờ dựng / chờ chọn khung. "editing" có bản lỗi, video mẫu không job: KHÔNG tính. */
export function videosRendering(all: VideoRecord[] = listVideos()): VideoRecord[] {
  return all.filter((v) => {
    if (v.status !== "editing" || isSampleVideo(v.id)) return false;
    const st = latestJob(v.id)?.job.status;
    return st === "queued" || st === "running" || st === "setup";
  });
}

/** Video thật "editing" có bản dựng mới nhất lỗi / đã dừng (cần Dựng lại). Video chưa có job / tệp không tính. */
export function videosRenderFailed(all: VideoRecord[] = listVideos()): VideoRecord[] {
  return all.filter((v) => v.status === "editing" && !isSampleVideo(v.id) && latestJob(v.id)?.job.status === "error");
}

/** Hook chờ chọn (trang /content/hooks). */
export function hooksAwaiting(): number {
  return getDb().select({ id: schema.hookIdeas.id }).from(schema.hookIdeas).where(eq(schema.hookIdeas.status, "new")).all().length;
}

/** Lead cần xử lý (badge menu "Lead"): lead thật giai đoạn "new" — chưa liên hệ. Lead mẫu không tính. */
export function leadsAwaiting(): number {
  return getDb().select({ id: schema.leads.id }).from(schema.leads).where(eq(schema.leads.stage, "new")).all().filter((l) => !isSample("lead", l.id)).length;
}
