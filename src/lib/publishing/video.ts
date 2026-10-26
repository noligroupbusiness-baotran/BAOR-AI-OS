// CP04: đăng video đã được OWNER duyệt lên mạng xã hội.
// OWNER APPROVAL → CHỌN KÊNH → LỊCH → ĐĂNG → XÁC MINH (đọc lại bài) → SỐ LIỆU.
// Luật cứng: chỉ video "approved"; một video một bài mỗi kênh (dedupe_key); PUBLISHED chỉ khi nền tảng trả mã bài
// và đọc lại được bài (permalink). Chế độ thử dựng đủ yêu cầu nhưng không gọi nền tảng, không bao giờ thành "đã đăng".
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { and, desc, eq, inArray, isNotNull, isNull, lte, ne } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { logActivity } from "@/lib/activity";
import { sendAlert } from "@/lib/alerts";
import { campaignRepo } from "@/lib/campaigns/repository";
import { EXTRA_FANPAGES, connectorFor, fanpageKey } from "@/lib/connectors/registry";
import { connectorContext, finishRun, readIntegrationConfig, startRun } from "@/lib/connectors/config";
import { CAPTION_LIMITS } from "@/lib/content/formats";
import { buildCaption, captionDraft } from "./caption";
import { getUpload, uploadPath, uploadsDir } from "@/lib/uploads";
import { latestJob } from "@/lib/video/jobs";
import { getAutomation } from "@/lib/queries";
import { isAdminEmail } from "@/lib/admin";
import { AMBIGUOUS_MARK, CLAIM_OWNER, PAGE_CHANGED_PREFIX, SAMPLE_NOTE, VERIFY_GIVE_UP_PREFIX, ambiguousRetryBlock, previousExternalId, holdClaim, releaseUnsentClaim, isAmbiguousFailure, isDryRun, isSamplePost, needsPageCheck, parseRescheduleWhen, recoverStuckPublishing, sweepOverduePosts } from "./guards";

export { AMBIGUOUS_MARK, isAmbiguousFailure, isDryRun } from "./guards";

export interface VideoChannel {
  platform: string;
  key: string;
  label: string;
  /** Lý do chưa đăng được bằng hệ thống (adapter chưa có / cần điều kiện ngoài). */
  blocked?: string;
}

export const VIDEO_CHANNELS: VideoChannel[] = [
  { platform: "facebook", key: "facebook_page", label: "Facebook Page" },
  { platform: "instagram", key: "instagram", label: "Instagram Reels", blocked: "Instagram chỉ nhận video qua đường dẫn công khai; máy chủ chưa có nơi phát tệp công khai." },
  { platform: "tiktok", key: "tiktok", label: "TikTok", blocked: "TikTok Content Posting API cần ứng dụng được TikTok duyệt và tài khoản kết nối." },
  { platform: "youtube", key: "youtube", label: "YouTube Shorts", blocked: "YouTube Data API cần OAuth kênh và dự án Google Cloud." },
];

/** Kênh đăng video: kênh gốc + Fanpage 2–4 (mỗi fanpage là một "nền tảng" riêng: bài, chống trùng, số liệu tách theo trang). */
export function videoChannels(): VideoChannel[] {
  const db = getDb();
  const extra = EXTRA_FANPAGES.map((n) => {
    const key = fanpageKey(n);
    const row = db.select({ account: schema.integrations.account }).from(schema.integrations).where(eq(schema.integrations.key, key)).get();
    return { platform: key, key, label: row?.account ? `Fanpage: ${row.account}` : `Facebook Fanpage ${n}` };
  });
  return [VIDEO_CHANNELS[0], ...extra, ...VIDEO_CHANNELS.slice(1)];
}

/** Giới hạn caption: fanpage dùng luật Facebook. */
export function captionLimitFor(platform: string) {
  return CAPTION_LIMITS.find((l) => l.platform === (platform.startsWith("facebook") ? "facebook" : platform));
}

const MAX_ATTEMPTS = 3;
const VERIFY_GIVE_UP_MS = 24 * 60 * 60 * 1000;

const nowIso = () => new Date().toISOString();
const newId = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export function channelStatus(platform: string): { channel?: VideoChannel; connected: boolean; canPublish: boolean; reason: string } {
  const channel = videoChannels().find((c) => c.platform === platform);
  if (!channel) return { connected: false, canPublish: false, reason: "Kênh không hỗ trợ" };
  const integ = getDb().select().from(schema.integrations).where(eq(schema.integrations.key, channel.key)).get();
  const connected = !!integ?.connected;
  if (channel.blocked) return { channel, connected, canPublish: false, reason: channel.blocked };
  if (!connectorFor(channel.key)?.publishVideo) return { channel, connected, canPublish: false, reason: "Chưa có adapter đăng video" };
  return { channel, connected, canPublish: connected, reason: connected ? "Đã kết nối" : "Chưa kết nối tài khoản" };
}

/** Caption đề xuất: bản nháp AI Viết bài đăng (nếu đã tạo) hoặc caption dựng theo skill viết content trong Second Brain từ kịch bản đã
 *  duyệt (src/lib/publishing/caption.ts). OWNER sửa trước khi lên lịch. */
export function suggestCaption(videoId: string): string {
  return captionDraft(videoId) ?? buildCaption(videoId).text;
}

/** Ảnh bìa: một khung ở 20% thời lượng bản chính, lưu vào kho tải lên. */
export function makeThumbnail(masterPath: string, title: string, by: string): string | null {
  const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", masterPath], { encoding: "utf8", timeout: 20_000 });
  const dur = Number(probe.stdout.trim()) || 0;
  const id = newId("up");
  const fileName = `${id}.jpg`;
  const out = path.join(uploadsDir(), fileName);
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-ss", String(Math.max(0, dur * 0.2)), "-i", masterPath, "-frames:v", "1", "-q:v", "3", out], { timeout: 30_000 });
  if (r.status !== 0 || !fs.existsSync(out)) return null;
  getDb()
    .insert(schema.uploads)
    .values({ id, kind: "image", name: `${title.slice(0, 80)} - bìa.jpg`, fileName, mime: "image/jpeg", size: fs.statSync(out).size, meta: JSON.stringify({ title: `Bìa: ${title}`, role: "thumbnail" }), uploadedBy: by, createdAt: nowIso() })
    .run();
  return id;
}

export type ScheduleResult = { ok: true; created: number; mode: "live" | "dry_run" } | { ok: false; error: string };

export function scheduleVideoPosts(input: { videoId: string; platforms: string[]; whenIso: string; caption: string; title?: string; by: string }): ScheduleResult {
  const db = getDb();
  const v = db.select().from(schema.videos).where(eq(schema.videos.id, input.videoId)).get();
  if (!v) return { ok: false, error: "Không tìm thấy video" };
  if (v.status !== "approved") return { ok: false, error: "Chỉ lên lịch được video OWNER đã phê duyệt" };
  const master = v.uploadId ? getUpload(v.uploadId) : undefined;
  const masterPath = master ? uploadPath(master) : null;
  if (!masterPath || !fs.existsSync(masterPath)) return { ok: false, error: "Không tìm thấy tệp video đã duyệt" };
  const caption = input.caption.trim();
  if (!caption) return { ok: false, error: "Cần caption" };
  const platforms = [...new Set(input.platforms)];
  if (!platforms.length) return { ok: false, error: "Chọn ít nhất một kênh" };
  for (const p of platforms) {
    const st = channelStatus(p);
    if (!st.channel) return { ok: false, error: `Kênh ${p} không hỗ trợ` };
    if (st.channel.blocked) return { ok: false, error: `${st.channel.label}: ${st.channel.blocked}` };
    const limit = captionLimitFor(p);
    if (limit && caption.length > limit.maxChars) return { ok: false, error: `${limit.label}: caption vượt ${caption.length - limit.maxChars} ký tự` };
  }
  // Hai kênh Facebook trỏ cùng một Page ID (nhập nhầm khi kết nối) → một video lên một trang hai lần mà chống trùng không bắt được
  const pageOf = new Map<string, string>();
  for (const p of platforms) {
    const key = channelStatus(p).channel?.key;
    if (!key || !key.startsWith("facebook_page")) continue;
    const pid = readIntegrationConfig(key).pageId;
    if (!pid) continue;
    const dup = pageOf.get(pid);
    if (dup) return { ok: false, error: `${dup} và ${channelStatus(p).channel?.label} cùng là trang ${pid} — kiểm lại Page ID ở Cài đặt › Kết nối` };
    pageOf.set(pid, channelStatus(p).channel?.label ?? p);
  }
  const when = Date.parse(input.whenIso);
  if (!Number.isFinite(when)) return { ok: false, error: "Giờ đăng không hợp lệ" };
  const dry = isDryRun();
  const keys = platforms.map((p) => `${p}:${v.id}`);
  // Kiểm chống trùng: chạy một lần để báo lỗi nhanh (trước khi dựng ảnh bìa), rồi chạy LẠI trong giao dịch BEGIN IMMEDIATE cùng lệnh
  // ghi — tiến trình khác cùng tệp CSDL không thể chen bài cùng trang giữa lúc kiểm và lúc ghi.
  const check = (): { ok: false; error: string } | { ok: true; existing: PostRow[] } => {
    // Chống đăng trùng THEO TRANG ĐÍCH: bài thật đã lên lịch/đã đăng thì không tạo lại; bài lỗi/huỷ cho phép tạo lại.
    // Kênh khác nhưng cùng Page ID (đã lên lịch ở lần trước) cũng là cùng trang — dedupe_key theo kênh không bắt được.
    const live = samePageBlockers(v.id, platforms, dry);
    if (dry && live.length) return { ok: false, error: `Video đã có bài thử đang chờ trên ${describeBlockers(live, platforms)}. Huỷ bài đó ở Đăng bài rồi lên lịch lại (đổi giờ / caption) — không tạo bài trùng.` };
    if (!dry && live.some((e) => e.status === "failed" && !e.externalId))
      return { ok: false, error: `Bài trên ${describeBlockers(live.filter((e) => isAmbiguousFailure(e)), platforms)} lỗi mơ hồ, có thể đã lên trang. Kiểm tra trang rồi dùng “Thử lại” (ghi lại đã kiểm tra), không lên lịch mới.` };
    if (!dry && live.length) return { ok: false, error: `Video đã có bài trên ${describeBlockers(live, platforms)} (${live.map((e) => e.status).join(", ")}). Không đăng trùng.` };
    const existing = dry ? [] : db.select().from(schema.scheduledPosts).where(inArray(schema.scheduledPosts.dedupeKey, keys)).all();
    // Một video một bài mỗi kênh (dedupe_key): bài đã gửi lên trang cũ (OWNER sửa Page ID kênh sau khi đăng) vẫn giữ khoá của kênh
    // (OWNER gỡ bằng "Gỡ khoá kênh" — releaseChannelLock). Chỉ bài lỗi rõ ràng / huỷ chưa có mã nền tảng mới nhả khoá — còn lại báo
    // lỗi, không để CSDL ném lỗi trùng khoá.
    const holders = existing.filter((x) => x.externalId || (x.status !== "failed" && x.status !== "cancelled"));
    if (holders.length)
      return { ok: false, error: `Kênh ${holders.map((x) => `${x.platform} đã có bài video này (${x.status}${x.externalId ? `, mã ${x.externalId}` : ""}${x.targetPageId ? `, trang ${x.targetPageId}` : ""})`).join("; ")}. Mỗi kênh một bài cho một video — không đăng trùng.` };
    return { ok: true, existing };
  };
  const pre = check();
  if (!pre.ok) return pre;
  const thumb = makeThumbnail(masterPath, v.title, input.by);
  const rows = platforms.map((p) => ({
    id: newId("sp"),
    contentId: v.contentId ?? "",
    // Tiêu đề bài đăng (AI / OWNER sửa ở Kho video); trống thì dùng tên video
    title: input.title?.trim().slice(0, 100) || v.title,
    platform: p,
    scheduledFor: new Date(when).toISOString(),
    status: "scheduled",
    videoId: v.id,
    caption,
    thumbnailUploadId: thumb,
    mode: dry ? "dry_run" : "live",
    dedupeKey: dry ? null : `${p}:${v.id}`,
    // Trang đích lúc lên lịch: chống trùng về sau theo trang này, không theo cấu hình kênh lúc kiểm
    targetPageId: channelPageId(p),
  }));
  const wrote = scheduleTx(() => {
    const c = check();
    if (!c.ok) return c;
    // Bài lỗi/huỷ cũ nhả khoá chống trùng để bài mới thay thế (lịch sử vẫn giữ).
    if (!dry) for (const e of c.existing) db.update(schema.scheduledPosts).set({ dedupeKey: null }).where(eq(schema.scheduledPosts.id, e.id)).run();
    // Bài quá hạn cũ cùng video + cùng trang đã được thay bằng bài mới → huỷ (không còn treo "cần xếp lại")
    for (const e of overdueOnSamePage(videoPostsFor(v.id), platforms)) db.update(schema.scheduledPosts).set({ status: "cancelled", dedupeKey: null, error: "Đã thay bằng bài lên lịch mới." }).where(eq(schema.scheduledPosts.id, e.id)).run();
    db.insert(schema.scheduledPosts).values(rows).run();
    return { ok: true };
  });
  if (!wrote.ok) return wrote;
  for (const r of rows) campaignRepo.inheritLinks("video", v.id, "publication", r.id, "scheduled");
  logActivity("human", `${input.by} lên lịch đăng video “${v.title}” lên ${platforms.join(", ")}${dry ? " (chế độ thử, không đăng thật)" : ""}.`, "publishing");
  return { ok: true, created: rows.length, mode: dry ? "dry_run" : "live" };
}

/** Page ID HIỆN TẠI của kênh Facebook (null: kênh khác / chưa nhập Page ID). */
export function channelPageId(platform: string): string | null {
  const key = videoChannels().find((c) => c.platform === platform)?.key;
  return (key?.startsWith("facebook_page") && readIntegrationConfig(key).pageId) || null;
}

/** Page ID HIỆN TẠI của mọi kênh (đọc cấu hình một lần cho cả danh sách bài — giao diện). */
export type ChannelPages = Map<string, string | null>;
export function channelPageIds(): ChannelPages {
  return new Map(videoChannels().map((c) => [c.platform, (c.key.startsWith("facebook_page") && readIntegrationConfig(c.key).pageId) || null]));
}

/** Kênh Facebook (có khái niệm Page ID) hay không. */
function isPageChannel(platform: string): boolean {
  return !!videoChannels().find((c) => c.platform === platform)?.key.startsWith("facebook_page");
}

/** Ghi lúc LÊN LỊCH (bài chữ và video) trong MỘT giao dịch BEGIN IMMEDIATE: hàm `write` kiểm lại chống trùng rồi mới ghi, trong cùng
 *  khoá ghi của SQLite (tiến trình khác cùng tệp CSDL chờ). Trả lỗi kiểm → không ghi gì. SQLITE_BUSY / lỗi CSDL → báo thử lại. */
export function scheduleTx(write: () => { ok: true } | { ok: false; error: string }): { ok: true } | { ok: false; error: string } {
  try {
    return getDb().transaction(() => write(), { behavior: "immediate" });
  } catch (e) {
    console.warn(`[publishing] lên lịch: ${e instanceof Error ? e.message : e}`);
    return { ok: false, error: "Hệ thống đang bận ghi lịch đăng — thử lại sau ít giây." };
  }
}

/** Trang đích thật của một kênh: kênh Facebook đã có Page ID → "fb:<Page ID>" (hai kênh nhập cùng Page ID là MỘT trang);
 *  kênh khác / chưa có Page ID → chính tên kênh. Đọc cấu hình HIỆN TẠI — dùng cho kênh SẮP đăng. */
function pageTarget(platform: string): string {
  const pid = channelPageId(platform);
  return pid ? `fb:${pid}` : platform;
}

type PostRow = typeof schema.scheduledPosts.$inferSelect;

/** Trang đích của một bài ĐÃ có. Bài đã gửi lệnh đăng (đang đăng / đã đăng / lỗi): Page ID lưu trong bài lúc đăng — OWNER sửa
 *  Page ID kênh sau đó không đổi trang bài đã lên. Bài còn chờ: tính theo trang kênh đang cấu hình (chặt hơn: nếu Page ID đã đổi so
 *  với lúc lên lịch thì lúc gửi claimForSend không gửi). Bài cũ chưa lưu Page ID → cấu hình kênh hiện tại như trước. */
function postTarget(e: PostRow): string {
  return e.targetPageId && e.status !== "scheduled" ? `fb:${e.targetPageId}` : pageTarget(e.platform);
}

/** Bài của video trên cùng TRANG với các kênh chọn mà chặn tạo / đăng lại bài mới.
 *  Đăng thật: bài thật còn sống — chưa lỗi / huỷ, hoặc nền tảng ĐÃ nhận video (có externalId), hoặc lỗi MƠ HỒ (có thể đã lên trang;
 *  chỉ đăng lại qua "Thử lại" kèm ghi chú đã kiểm tra trang). Bài thử không bao giờ lên trang nên không chặn.
 *  Chế độ thử: bài (thử hoặc thật) còn đang chờ — lên lịch lại là tạo bài thứ hai; muốn đổi giờ / caption thì huỷ bài chờ trước. */
function samePageBlockers(videoId: string, platforms: string[], dry: boolean, exceptId?: string): PostRow[] {
  return pageBlockersAmong(videoPostsFor(videoId), platforms, dry, exceptId);
}

/** Luật chống trùng theo trang, dùng chung cho bài video (cùng video) và bài chữ (cùng nội dung): xem samePageBlockers.
 *  Bài quá hạn (chưa từng gửi lệnh đăng) không chặn — đó chính là bài cần xếp lại. */
export function pageBlockersAmong(rows: PostRow[], platforms: string[], dry: boolean, exceptId?: string): PostRow[] {
  const targets = new Set(platforms.map(pageTarget));
  return rows.filter((e) => {
    if (e.id === exceptId || !targets.has(postTarget(e))) return false;
    if (dry) return e.status === "scheduled" || e.status === "publishing";
    return e.mode !== "dry_run" && ((e.status !== "failed" && e.status !== "cancelled" && e.status !== "overdue") || !!e.externalId || isAmbiguousFailure(e));
  });
}

/** Bài quá hạn (chưa từng gửi lệnh đăng) trên cùng trang với các kênh chọn — bị thay khi lên lịch bài mới. */
export function overdueOnSamePage(rows: PostRow[], platforms: string[]): PostRow[] {
  const targets = new Set(platforms.map(pageTarget));
  return rows.filter((e) => e.status === "overdue" && targets.has(postTarget(e)));
}

/** "facebook, facebook_page_3 (cùng trang 111 với kênh anh chọn)" — nêu rõ khi bài chặn nằm ở kênh khác cùng Page ID. */
export function describeBlockers(rows: PostRow[], chosen: string[]): string {
  const names = [...new Set(rows.map((e) => e.platform))];
  // Bài ở kênh khác, hoặc cùng kênh nhưng đã lên trang khác cấu hình hiện tại (OWNER sửa Page ID sau khi đăng)
  const cross = rows.filter((e) => !chosen.includes(e.platform) || postTarget(e) !== pageTarget(e.platform));
  const pages = [...new Set(cross.map(postTarget).filter((t) => t.startsWith("fb:")).map((t) => t.slice(3)))];
  return names.join(", ") + (pages.length ? ` (cùng trang ${pages.join(", ")} với kênh anh chọn — kiểm lại Page ID ở Cài đặt › Kết nối nếu nhập nhầm)` : "");
}

/** Page ID kênh HIỆN TẠI khác trang đã lưu lúc lên lịch → lý do không gửi (null = cùng trang, hoặc bài cũ / kênh không phải
 *  Facebook nên không lưu trang). Không tự đăng lên trang khác trang OWNER chọn lúc lên lịch. */
export function pageChangedReason(p: Pick<PostRow, "platform" | "targetPageId">): string | null {
  if (!p.targetPageId) return null;
  const now = channelPageId(p.platform);
  if (now === p.targetPageId) return null;
  return `${PAGE_CHANGED_PREFIX}: lúc lên lịch là trang ${p.targetPageId}, kênh ${p.platform} giờ ${now ? `là trang ${now}` : "chưa có Page ID"}. Không gửi lệnh đăng — kiểm Cài đặt › Kết nối rồi Đăng lại (đăng lên trang hiện tại) hoặc Huỷ.`;
}

/** Bài CHƯA lưu trang đích (trước migration 0023 / kênh Facebook chưa có Page ID lúc lên lịch) — luật lúc gửi (null = gửi được,
 *  claimForSend đóng dấu trang hiện tại vào bài trong cùng giao dịch giành quyền):
 *  - kênh không phải Facebook: không có khái niệm trang → gửi;
 *  - kênh Facebook chưa có Page ID: không biết gửi lên trang nào → không gửi;
 *  - CSDL có dấu kênh từng trỏ trang KHÁC trang hiện tại (bài khác cùng kênh lưu trang khác): không biết lúc lên lịch OWNER chọn
 *    trang nào → mơ hồ, không gửi. Cả hai trường hợp không gửi đều là lỗi rõ ràng (chưa gửi gì): OWNER kiểm kênh rồi Đăng lại =
 *    đăng lên trang hiện tại (retry đọc PAGE_CHANGED_PREFIX), hoặc Huỷ. */
export function missingPageReason(p: Pick<PostRow, "id" | "platform" | "targetPageId">): string | null {
  if (p.targetPageId || !isPageChannel(p.platform)) return null;
  const now = channelPageId(p.platform);
  if (!now) return `${PAGE_CHANGED_PREFIX}: bài chưa lưu trang đích và kênh ${p.platform} chưa có Page ID. Không gửi lệnh đăng — nhập Page ID ở Cài đặt › Kết nối rồi Đăng lại, hoặc Huỷ.`;
  const t = schema.scheduledPosts;
  const other = getDb().select({ page: t.targetPageId }).from(t).where(and(eq(t.platform, p.platform), isNotNull(t.targetPageId), ne(t.targetPageId, now), ne(t.id, p.id))).get();
  if (other?.page) return `${PAGE_CHANGED_PREFIX}: bài chưa lưu trang đích, kênh ${p.platform} từng là trang ${other.page}, giờ là trang ${now}. Không gửi lệnh đăng — kiểm Cài đặt › Kết nối rồi Đăng lại (đăng lên trang ${now}) hoặc Huỷ.`;
  return null;
}

/** Bài cùng video (bài video) / cùng nội dung chữ (bài chữ) với bài này. */
function siblingPosts(p: PostRow): PostRow[] {
  const t = schema.scheduledPosts;
  return p.videoId ? videoPostsFor(p.videoId) : getDb().select().from(t).where(and(eq(t.contentId, p.contentId), isNull(t.videoId))).all();
}

export type SendClaim = { ok: true; post: PostRow } | { ok: false; outcome: "lost" | "failed" | "cancelled" | "error"; reason: string };

/** GIÀNH QUYỀN GỬI THEO TRANG — bước cuối ngay trước khi gọi nền tảng, dùng chung bài chữ và bài video.
 *  Trong MỘT giao dịch BEGIN IMMEDIATE (khoá ghi của SQLite: tiến trình khác cùng tệp CSDL phải chờ — busy_timeout mặc định 5 s
 *  của better-sqlite3) đọc lại bài, Page ID kênh hiện tại và các bài cùng video / nội dung trên cùng trang, rồi mới chuyển
 *  "publishing". Kiểm và giành quyền nằm trong cùng một khoá nên hai tiến trình không thể cùng thấy "trang trống" rồi cùng gửi.
 *  Không dùng unique index (xem báo cáo 26/10): CSDL đang chạy có thể đã có dòng trùng → migration tạo index sẽ thất bại.
 *  - Bài không còn "scheduled" (lượt / tiến trình khác đã giành) → lost.
 *  - Page ID kênh đã đổi so với lúc lên lịch, hoặc bài chưa lưu trang mà không xác định được (missingPageReason) → failed (lỗi rõ
 *    ràng, chưa gửi gì: Đăng lại / Huỷ được).
 *  - Trang đã có bài khác cùng video / nội dung đã gửi lệnh đăng (đang đăng / đang xác minh / đã đăng / có mã / lỗi mơ hồ) → cancelled. */
export function claimForSend(postId: string): SendClaim {
  try {
    return claimForSendTx(postId);
  } catch (e) {
    // SQLITE_BUSY (tiến trình khác giữ khoá ghi quá busy_timeout) hay lỗi CSDL khác: chỉ bỏ qua BÀI NÀY ở lượt này (vẫn "scheduled",
    // chưa gửi gì, lượt sau thử lại) — không để lỗi thoát lên làm cả lượt chạy bỏ qua phần đăng / xác minh. Không ghi CSDL ở đây
    // (đang bận khoá); ghi ra nhật ký máy chủ.
    const reason = `Chưa giành được quyền gửi (${e instanceof Error ? e.message : e}); thử lại lượt sau.`;
    console.warn(`[publishing] ${postId}: ${reason}`);
    return { ok: false, outcome: "error", reason };
  }
}

function claimForSendTx(postId: string): SendClaim {
  const t = schema.scheduledPosts;
  return getDb().transaction(
    (tx) => {
      const p = tx.select().from(t).where(eq(t.id, postId)).get();
      if (!p || p.status !== "scheduled") return { ok: false as const, outcome: "lost" as const, reason: "Bài đã được lượt chạy khác giành quyền đăng." };
      const changed = pageChangedReason(p) ?? missingPageReason(p);
      if (changed) {
        tx.update(t).set({ status: "failed", error: changed }).where(and(eq(t.id, p.id), eq(t.status, "scheduled"))).run();
        return { ok: false as const, outcome: "failed" as const, reason: changed };
      }
      // Bài cùng trang còn "scheduled" không chặn (bài nào giành quyền trước thì đăng, bài kia tới lượt sẽ thấy và bị huỷ).
      const sent = pageBlockersAmong(siblingPosts(p), [p.platform], false, p.id).filter((e) => e.status !== "scheduled");
      if (sent.length) {
        const reason = `Trùng: ${p.videoId ? "video" : "nội dung"} đã có bài trên ${describeBlockers(sent, [p.platform])} (${sent.map((e) => e.status).join(", ")}). Không đăng trùng.`;
        tx.update(t).set({ status: "cancelled", dedupeKey: null, error: reason }).where(and(eq(t.id, p.id), eq(t.status, "scheduled"))).run();
        return { ok: false as const, outcome: "cancelled" as const, reason };
      }
      // Lưu trang thật sắp nhận lệnh đăng (= trang lúc lên lịch; bài chưa lưu thì đóng dấu trang kênh hiện tại — missingPageReason đã
      // loại trường hợp mơ hồ) + quyền gửi của tiến trình này (claimed_by / claimed_at: recoverStuckPublishing không đánh nhầm).
      const r = tx
        .update(t)
        .set({ status: "publishing", attempts: p.attempts + 1, targetPageId: channelPageId(p.platform) ?? p.targetPageId, claimedBy: CLAIM_OWNER, claimedAt: new Date().toISOString() })
        .where(and(eq(t.id, p.id), eq(t.status, "scheduled")))
        .run();
      if (r.changes !== 1) return { ok: false as const, outcome: "lost" as const, reason: "Bài đã được lượt chạy khác giành quyền đăng." };
      return { ok: true as const, post: tx.select().from(t).where(eq(t.id, p.id)).get()! };
    },
    { behavior: "immediate" },
  );
}

function videoFile(videoId: string): { path: string; name: string; size: number } | null {
  const v = getDb().select().from(schema.videos).where(eq(schema.videos.id, videoId)).get();
  const u = v?.uploadId ? getUpload(v.uploadId) : undefined;
  const p = u ? uploadPath(u) : null;
  if (!u || !p || !fs.existsSync(p)) return null;
  return { path: p, name: u.name.endsWith(".mp4") ? u.name : `${u.name}.mp4`, size: fs.statSync(p).size };
}

/** Bộ chạy nền gọi mỗi phút. */
export async function publishDueVideoPosts(): Promise<{ published: number; tested: number; failed: number; skipped: number }> {
  const db = getDb();
  const out = { published: 0, tested: 0, failed: 0, skipped: 0 };
  // Máy chủ khởi động lại giữa lúc đăng: không tự đăng lại (có thể đã lên), đánh lỗi để người kiểm tra (bài chữ lẫn video).
  recoverStuckPublishing();
  // Bài quá giờ hẹn quá lâu (vd lên lịch từ tháng trước, vừa nối Facebook) → "Quá hạn, cần xếp lại", không tự đăng.
  sweepOverduePosts();
  // Công tắc Cài đặt › Tự động "Tự động đăng bài đã duyệt" áp cho cả bài video (như bài chữ).
  if (getAutomation().auto_publish === false) return out;
  const due = db
    .select()
    .from(schema.scheduledPosts)
    .where(and(eq(schema.scheduledPosts.status, "scheduled"), lte(schema.scheduledPosts.scheduledFor, nowIso())))
    .all()
    .filter((p) => p.videoId);
  for (const post of due) {
    if (isSamplePost(post)) {
      if (post.error !== SAMPLE_NOTE) db.update(schema.scheduledPosts).set({ error: SAMPLE_NOTE }).where(eq(schema.scheduledPosts.id, post.id)).run();
      out.skipped++;
      continue;
    }
    const video = db.select().from(schema.videos).where(eq(schema.videos.id, post.videoId!)).get();
    if (!video || video.status !== "approved") {
      db.update(schema.scheduledPosts).set({ status: "failed", error: "Video không còn ở trạng thái đã duyệt. Không đăng." }).where(eq(schema.scheduledPosts.id, post.id)).run();
      out.failed++;
      continue;
    }
    const file = videoFile(post.videoId!);
    if (!file) {
      db.update(schema.scheduledPosts).set({ status: "failed", error: "Không tìm thấy tệp video" }).where(eq(schema.scheduledPosts.id, post.id)).run();
      out.failed++;
      continue;
    }
    if (post.mode === "dry_run") {
      db.update(schema.scheduledPosts)
        .set({ status: "dry_run", error: `Chế độ thử: đủ điều kiện đăng (${(file.size / 1024 / 1024).toFixed(1)} MB, caption ${post.caption?.length ?? 0} ký tự). Không gọi ${post.platform}.` })
        .where(eq(schema.scheduledPosts.id, post.id))
        .run();
      logActivity("system", `Chế độ thử: “${post.title}” đủ điều kiện đăng ${post.platform}, không đăng thật.`, "publishing");
      out.tested++;
      continue;
    }
    // Công tắc chế độ thử: đang bật thì không gọi nền tảng, kể cả bài đã lên lịch đăng thật từ trước (giữ lại, không đăng).
    if (isDryRun()) {
      db.update(schema.scheduledPosts).set({ error: "Chế độ thử đang bật: bài đăng thật được giữ lại, chưa gọi nền tảng." }).where(eq(schema.scheduledPosts.id, post.id)).run();
      out.skipped++;
      continue;
    }
    const st = channelStatus(post.platform);
    if (!st.canPublish || !st.channel) {
      db.update(schema.scheduledPosts).set({ error: st.reason }).where(eq(schema.scheduledPosts.id, post.id)).run();
      out.skipped++;
      continue;
    }
    // Giành quyền gửi THEO TRANG, nguyên tử kể cả nhiều tiến trình: kiểm lại Page ID + bài trùng trang ngay trước khi gọi nền tảng.
    const claim = claimForSend(post.id);
    if (!claim.ok) {
      if (claim.outcome === "error") out.skipped++;
      else if (claim.outcome !== "lost") {
        out[claim.outcome === "failed" ? "failed" : "skipped"]++;
        campaignRepo.syncEntityStatus("publication", post.id, claim.outcome);
        logActivity("system", `Không gửi “${post.title}” lên ${post.platform}: ${claim.reason}`, "publishing");
        if (claim.outcome === "failed") void sendAlert({ level: "error", title: `Không đăng: ${post.title}`, text: claim.reason, href: "/publishing" });
      }
      continue;
    }
    // Giữa giành quyền và gọi nền tảng: lỗi ở đây (CSDL bận / hỏng) = CHƯA gửi gì → trả bài về "chờ đăng", không để kẹt "publishing".
    let runId: string;
    let ctx: ReturnType<typeof connectorContext>;
    try {
      ctx = connectorContext(st.channel.key);
      runId = startRun(st.channel.key, "publish_video");
    } catch (e) {
      releaseUnsentClaim(post.id, claim.post.attempts - 1, `Chưa gửi (${e instanceof Error ? e.message : e}); thử lại lượt sau.`);
      out.skipped++;
      continue;
    }
    const release = holdClaim(post.id);
    try {
      const connector = connectorFor(st.channel.key)!;
      const res = await connector.publishVideo!(ctx, { postId: post.id, title: post.title, description: post.caption ?? "", filePath: file.path, fileName: file.name, fileSize: file.size });
      if (res.ok && res.externalId) {
        db.update(schema.scheduledPosts).set({ status: "verifying", externalId: res.externalId, error: null, publishedAt: nowIso() }).where(eq(schema.scheduledPosts.id, post.id)).run();
        finishRun(runId, true, res.message, 1);
        out.published++;
      } else {
        const attempts = post.attempts + 1;
        // Lỗi mơ hồ sau khi đã gửi lệnh đăng: không tự thử lại (có thể đã lên), để người kiểm tra trang.
        const retry = attempts < MAX_ATTEMPTS && !res.ambiguous;
        db.update(schema.scheduledPosts)
          .set(retry ? { status: "scheduled", error: `${res.message} (thử lại lần ${attempts + 1})`, scheduledFor: new Date(Date.now() + attempts * 10 * 60_000).toISOString() } : { status: "failed", error: res.ambiguous ? `${AMBIGUOUS_MARK} ${res.message}` : res.message })
          .where(eq(schema.scheduledPosts.id, post.id))
          .run();
        finishRun(runId, false, res.message);
        if (!retry) {
          out.failed++;
          logActivity("system", `Đăng video “${post.title}” lên ${post.platform} thất bại sau ${attempts} lần: ${res.message}`, "publishing");
          void sendAlert({ level: "error", title: `Đăng video lỗi: ${post.title}`, text: res.message, href: "/publishing" });
        }
      }
    } finally {
      release();
    }
  }
  return out;
}

/** Xác minh bài vừa đăng bằng cách đọc lại từ nền tảng. Chỉ khi đọc được mới chuyển "Đã đăng". */
export async function verifyPublishingPosts(): Promise<{ verified: number; pending: number }> {
  const db = getDb();
  const out = { verified: 0, pending: 0 };
  for (const p of db.select().from(schema.scheduledPosts).where(eq(schema.scheduledPosts.status, "verifying")).all()) {
    const st = channelStatus(p.platform);
    const connector = st.channel ? connectorFor(st.channel.key) : undefined;
    // Bài video đọc lại video; bài chữ đọc lại bài trên trang (trường khác nhau trên Graph API)
    const verify = p.videoId ? connector?.verifyPost : connector?.verifyFeedPost;
    // Kênh không còn connector / hàm đọc lại (hoặc bài thiếu mã): không đọc lại được — vẫn phải ra "cần kiểm trang" sau hạn bỏ cuộc,
    // không kẹt "đang xác minh" mãi. Lỗi ném ra khi đọc lại (mạng) cũng tính như một lần đọc không được.
    let r: { ok: boolean; permalink?: string; publishedAt?: string; message: string };
    if (!verify || !p.externalId || !st.channel) r = { ok: false, message: !p.externalId ? "Bài thiếu mã trên nền tảng" : "Kênh không còn kết nối đọc lại bài" };
    else {
      try {
        r = await verify(connectorContext(st.channel.key), p.externalId);
      } catch (e) {
        r = { ok: false, message: `Lỗi khi đọc lại bài (${e instanceof Error ? e.message : e})` };
      }
    }
    if (r.ok && r.permalink) {
      const at = nowIso();
      db.update(schema.scheduledPosts).set({ status: "published", permalink: r.permalink, verifiedAt: at, publishedAt: r.publishedAt ?? p.publishedAt ?? at, error: null }).where(eq(schema.scheduledPosts.id, p.id)).run();
      campaignRepo.syncEntityStatus("publication", p.id, "published");
      if (p.contentId) db.update(schema.contentItems).set({ status: "published" }).where(eq(schema.contentItems.id, p.contentId)).run();
      logActivity("system", `Đã đăng và xác minh “${p.title}” trên ${p.platform}: ${r.permalink}`, "publishing");
      out.verified++;
    } else if (Date.now() - Date.parse(p.publishedAt ?? p.scheduledFor) > VERIFY_GIVE_UP_MS) {
      // Bài cũ thiếu publishedAt: tính từ giờ hẹn (luôn trước lúc gửi) — không có mốc thì không bao giờ bỏ cuộc được
      db.update(schema.scheduledPosts).set({ status: "failed", error: `${VERIFY_GIVE_UP_PREFIX}: ${r.message}. Kiểm tra trang${p.externalId ? ` (mã ${p.externalId})` : ""}.` }).where(and(eq(schema.scheduledPosts.id, p.id), eq(schema.scheduledPosts.status, "verifying"))).run();
      campaignRepo.syncEntityStatus("publication", p.id, "failed");
      logActivity("system", `“${p.title}” trên ${p.platform}: ${VERIFY_GIVE_UP_PREFIX} (${r.message}) — cần kiểm trang.`, "publishing");
    } else {
      if (p.error !== r.message) db.update(schema.scheduledPosts).set({ error: r.message }).where(eq(schema.scheduledPosts.id, p.id)).run();
      out.pending++;
    }
  }
  return out;
}

/** Số liệu theo bài (mỗi 6 giờ) cho bài video thật đã xác minh. */
export async function syncVideoPostMetrics(): Promise<{ updated: number; errors: number }> {
  const db = getDb();
  const out = { updated: 0, errors: 0 };
  const cutoff = Date.now() - 6 * 60 * 60 * 1000;
  for (const p of db.select().from(schema.scheduledPosts).where(and(eq(schema.scheduledPosts.status, "published"), eq(schema.scheduledPosts.mode, "live"))).all()) {
    if (!p.videoId || !p.externalId || (p.metricsAt && Date.parse(p.metricsAt) > cutoff)) continue;
    const st = channelStatus(p.platform);
    const connector = st.channel ? connectorFor(st.channel.key) : undefined;
    if (!connector?.postMetrics) continue;
    try {
      const m = await connector.postMetrics(connectorContext(st.channel!.key), p.externalId);
      db.update(schema.scheduledPosts).set({ views: m.views ?? p.views, reach: m.reach ?? p.reach, engagement: m.engagement ?? p.engagement, metricsAt: nowIso() }).where(eq(schema.scheduledPosts.id, p.id)).run();
      out.updated++;
    } catch {
      out.errors++;
    }
  }
  return out;
}

/** Thử lại bài video lỗi, hoặc "Xếp lại" bài quá hạn (bắt buộc chọn giờ mới — không đăng ngay). */
export function retryVideoPost(postId: string, checkedNote?: string, whenIso?: string, by?: { email: string; name?: string }): { ok: boolean; error?: string } {
  const db = getDb();
  const p = db.select().from(schema.scheduledPosts).where(eq(schema.scheduledPosts.id, postId)).get();
  if (!p?.videoId) return { ok: false, error: "Không tìm thấy bài video" };
  if (p.status !== "failed" && p.status !== "overdue") return { ok: false, error: "Chỉ thử lại bài lỗi hoặc xếp lại bài quá hạn" };
  if (isSamplePost(p)) return { ok: false, error: SAMPLE_NOTE };
  if (p.externalId) return { ok: false, error: `Nền tảng đã nhận video (mã ${p.externalId}). Kiểm tra trang, không đăng lại để tránh trùng.` };
  const amb = ambiguousRetryBlock(p, checkedNote, by);
  if (amb) return { ok: false, error: amb };
  let at = nowIso();
  if (p.status === "overdue") {
    const w = parseRescheduleWhen(whenIso);
    if (!w.ok) return { ok: false, error: w.error };
    at = w.iso;
    const video = db.select({ status: schema.videos.status }).from(schema.videos).where(eq(schema.videos.id, p.videoId)).get();
    if (video?.status !== "approved") return { ok: false, error: "Video không còn ở trạng thái đã duyệt." };
  }
  // Bài lỗi cũ đã có bài thay thế (cùng trang, kể cả kênh khác cùng Page ID): đăng lại bài cũ là đăng trùng
  const twins = samePageBlockers(p.videoId, [p.platform], p.mode === "dry_run", p.id);
  if (twins.length) return { ok: false, error: `Video đã có bài trên ${describeBlockers(twins, [p.platform])} (${twins.map((e) => e.status).join(", ")}). Không đăng trùng — dùng bài đó, hoặc huỷ bài đó rồi thử lại.` };
  // Bài quá hạn đã nhả khoá chống trùng: bài thật lấy lại khoá của kênh nếu còn trống
  let dedupeKey = p.dedupeKey;
  if (p.mode !== "dry_run" && !dedupeKey) {
    const k = `${p.platform}:${p.videoId}`;
    if (!db.select({ id: schema.scheduledPosts.id }).from(schema.scheduledPosts).where(eq(schema.scheduledPosts.dedupeKey, k)).get()) dedupeKey = k;
  }
  // Mã bài cũ (OWNER kiểm "Không thấy bài") giữ trong ghi chú + nhật ký: còn tra / xoá bài thứ nhất nếu nhìn nhầm
  const oldId = previousExternalId(p);
  // Bài bị chặn vì Page ID kênh đã đổi: OWNER bấm Đăng lại = đăng lên trang kênh HIỆN TẠI (đã kiểm chống trùng theo trang đó ở trên).
  // Lỗi khác giữ trang lúc lên lịch: kênh đổi trang thì lúc gửi vẫn bị chặn, không lặng lẽ đăng sang trang khác.
  const targetPageId = (p.error ?? "").startsWith(PAGE_CHANGED_PREFIX) ? channelPageId(p.platform) : p.targetPageId;
  db.update(schema.scheduledPosts).set({ status: "scheduled", scheduledFor: at, error: oldId ? `Đăng lại sau kiểm trang — mã bài cũ ${oldId}.` : null, dedupeKey, targetPageId }).where(eq(schema.scheduledPosts.id, postId)).run();
  if (oldId || isAmbiguousFailure(p)) logActivity("human", `${by?.name ?? by?.email ?? "Người dùng"} đăng lại bài lỗi “${p.title}” trên ${p.platform}${oldId ? ` (mã bài cũ ${oldId})` : ""}${checkedNote?.trim() ? `; đã kiểm trang: ${checkedNote.trim().slice(0, 120)}` : ""}.`, "publishing");
  campaignRepo.syncEntityStatus("publication", postId, "scheduled");
  return { ok: true };
}

/** Huỷ bài chờ đăng / quá hạn / lỗi rõ ràng (chưa từng lên nền tảng). Bài có mã nền tảng hoặc lỗi mơ hồ: kiểm trang trước. */
export function cancelVideoPost(postId: string, by?: { email: string; name?: string }): { ok: boolean; error?: string } {
  const db = getDb();
  const p = db.select().from(schema.scheduledPosts).where(eq(schema.scheduledPosts.id, postId)).get();
  if (!p?.videoId) return { ok: false, error: "Không tìm thấy bài video" };
  return cancelPostRow(p, by);
}

/** Luật huỷ chung cho bài video và bài chữ. */
export function cancelPostRow(p: PostRow, by?: { email: string; name?: string }): { ok: boolean; error?: string } {
  // Lỗi mơ hồ CHƯA có mã bài: huỷ được (huỷ không đăng gì) — ghi nhật ký vì bài có thể đã lên trang
  const cancellable = p.status === "scheduled" || p.status === "overdue" || (p.status === "failed" && !p.externalId && (!needsPageCheck(p) || isAmbiguousFailure(p)));
  if (!cancellable) return { ok: false, error: needsPageCheck(p) ? "Bài có thể đã lên trang: dùng “Đã kiểm trang” trước." : "Chỉ huỷ được bài chờ đăng, quá hạn hoặc lỗi chưa lên trang" };
  const r = getDb()
    .update(schema.scheduledPosts)
    .set({ status: "cancelled", dedupeKey: null })
    .where(and(eq(schema.scheduledPosts.id, p.id), eq(schema.scheduledPosts.status, p.status)))
    .run();
  if (!r.changes) return { ok: false, error: "Bài vừa đổi trạng thái, tải lại trang" };
  campaignRepo.syncEntityStatus("publication", p.id, "cancelled");
  if (isAmbiguousFailure(p)) logActivity("human", `${by?.name ?? by?.email ?? "Người dùng"} huỷ bài lỗi mơ hồ “${p.title}” trên ${p.platform} (lệnh đăng đã gửi, bài có thể đã lên trang — kiểm trang nếu cần).`, "publishing");
  return { ok: true };
}

/** Khoá kênh (dedupe_key: một video / nội dung một bài mỗi kênh) do bài ĐÃ gửi lên trang giữ. Bài lên nhầm trang (Page ID kênh nhập
 *  nhầm, sau đó đã sửa) giữ khoá mãi → kênh không lên lịch được bài đúng trang. Gỡ được (null) khi: bài đang giữ khoá thật (có mã /
 *  chưa lỗi-huỷ), đã gửi xong (không còn chờ / đang gửi), có lưu trang đích, và trang đó KHÁC Page ID kênh hiện tại — chống trùng
 *  theo trang (pageBlockersAmong) vẫn chặn trang cũ, nên gỡ khoá không mở đường đăng trùng lên cùng một trang. */
export function channelLockReleaseBlock(p: PostRow, pages?: ChannelPages): string | null {
  if (!p.dedupeKey || p.mode === "dry_run") return "Bài không giữ khoá kênh.";
  // Bài chưa từng gửi lệnh đăng (chờ / đang gửi / quá hạn): không có gì trên trang để "nhầm" — dùng Xếp lại / Huỷ.
  if (p.status === "scheduled" || p.status === "publishing" || p.status === "overdue") return "Bài chưa gửi xong: dùng Xếp lại / Huỷ.";
  // Lỗi / huỷ chưa có mã: scheduleVideoPosts / scheduleTextPosts tự nhả khoá khi lên lịch bài thay thế
  if (!p.externalId && (p.status === "failed" || p.status === "cancelled")) return "Khoá tự nhả khi lên lịch lại.";
  if (!p.targetPageId) return "Bài chưa lưu trang đích: không xác định được trang nhầm.";
  const now = pages ? (pages.get(p.platform) ?? null) : channelPageId(p.platform);
  if (!now) return "Kênh chưa có Page ID: nhập Page ID đúng trước.";
  if (now === p.targetPageId) return "Bài ở đúng trang kênh hiện tại: khoá đúng, không gỡ.";
  return null;
}

/** OWNER "Gỡ khoá kênh": nhả dedupe_key của bài đã lên trang nhập nhầm. KHÔNG xoá bài, không đổi trạng thái; ghi lý do vào bài
 *  (lock_released_note) + nhật ký. Kiểm lại trong giao dịch BEGIN IMMEDIATE (bài / Page ID kênh vừa đổi thì không gỡ). Chỉ OWNER. */
export function releaseChannelLock(postId: string, by: { email: string; name?: string }): { ok: boolean; error?: string } {
  if (!isAdminEmail(by.email)) return { ok: false, error: "Chỉ OWNER (tài khoản quản trị chính) gỡ khoá kênh." };
  const t = schema.scheduledPosts;
  const who = by.name ?? by.email;
  let done: { ok: true; post: PostRow; page: string } | { ok: false; error: string };
  try {
    done = getDb().transaction(
      (tx) => {
        const p = tx.select().from(t).where(eq(t.id, postId)).get();
        if (!p) return { ok: false as const, error: "Không tìm thấy bài" };
        const block = channelLockReleaseBlock(p);
        if (block) return { ok: false as const, error: block };
        const page = channelPageId(p.platform)!;
        const at = nowIso();
        const note = `Gỡ khoá kênh (${who}, ${at.slice(0, 16).replace("T", " ")} UTC): bài ở trang ${p.targetPageId}${p.externalId ? `, mã ${p.externalId}` : ""}; kênh ${p.platform} giờ là trang ${page}. Khoá cũ ${p.dedupeKey}.`;
        const r = tx.update(t).set({ dedupeKey: null, lockReleasedNote: note }).where(and(eq(t.id, p.id), eq(t.dedupeKey, p.dedupeKey!), eq(t.status, p.status))).run();
        if (r.changes !== 1) return { ok: false as const, error: "Bài vừa đổi trạng thái, tải lại trang" };
        return { ok: true as const, post: p, page };
      },
      { behavior: "immediate" },
    );
  } catch (e) {
    return { ok: false, error: `Chưa gỡ được (${e instanceof Error ? e.message : e}) — thử lại.` };
  }
  if (!done.ok) return done;
  const p = done.post;
  logActivity("human", `${who} gỡ khoá kênh ${p.platform} của bài “${p.title}” (bài ở trang ${p.targetPageId}${p.externalId ? `, mã ${p.externalId}` : ""}; kênh giờ là trang ${done.page}). Bài giữ nguyên, không xoá.`, "publishing");
  return { ok: true };
}

/** OWNER mở trang kiểm bài lỗi "có thể đã lên" (có mã bài / [CẦN KIỂM TRA TRANG] / xác minh quá 24 giờ).
 *  found = true → "Đã đăng" (OWNER xác nhận, ghi verifiedAt). found = false → bỏ dấu mơ hồ / mã cũ để Thử lại hoặc Huỷ được. Chỉ OWNER. */
export function confirmPageChecked(postId: string, by: { email: string; name?: string }, found: boolean): { ok: boolean; error?: string } {
  if (!isAdminEmail(by.email)) return { ok: false, error: "Chỉ OWNER (tài khoản quản trị chính) xác nhận kết quả kiểm trang." };
  const db = getDb();
  const p = db.select().from(schema.scheduledPosts).where(eq(schema.scheduledPosts.id, postId)).get();
  if (!p) return { ok: false, error: "Không tìm thấy bài" };
  if (!needsPageCheck(p)) return { ok: false, error: "Bài này không cần kiểm trang" };
  const at = nowIso();
  const who = by.name ?? by.email;
  if (found) {
    db.update(schema.scheduledPosts)
      .set({ status: "published", verifiedAt: at, publishedAt: p.publishedAt ?? at, error: `OWNER xác nhận trên trang (${who}, ${at.slice(0, 16).replace("T", " ")} UTC).` })
      .where(and(eq(schema.scheduledPosts.id, p.id), eq(schema.scheduledPosts.status, "failed")))
      .run();
    campaignRepo.syncEntityStatus("publication", p.id, "published");
    if (p.contentId) db.update(schema.contentItems).set({ status: "published" }).where(eq(schema.contentItems.id, p.contentId)).run();
  } else {
    db.update(schema.scheduledPosts)
      .set({ externalId: null, error: `OWNER đã kiểm trang (${who}): không thấy bài${p.externalId ? ` (mã cũ ${p.externalId})` : ""}. Thử lại hoặc huỷ được.` })
      .where(and(eq(schema.scheduledPosts.id, p.id), eq(schema.scheduledPosts.status, "failed")))
      .run();
  }
  const code = previousExternalId(p);
  logActivity("human", `${who} kiểm trang bài “${p.title}” trên ${p.platform}: ${found ? "có bài → Đã đăng" : "không thấy bài"}${code ? ` (mã bài ${code})` : ""}.`, "publishing");
  return { ok: true };
}

export function videoPostsFor(videoId: string) {
  return getDb().select().from(schema.scheduledPosts).where(eq(schema.scheduledPosts.videoId, videoId)).all();
}

export function latestBlockers(videoId: string): string[] {
  return latestJob(videoId)?.report?.blockers ?? [];
}

export function listVideoPosts() {
  return getDb().select().from(schema.scheduledPosts).where(isNotNull(schema.scheduledPosts.videoId)).orderBy(desc(schema.scheduledPosts.scheduledFor)).all();
}
