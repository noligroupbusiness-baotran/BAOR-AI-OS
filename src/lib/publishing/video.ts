// CP04: đăng video đã được OWNER duyệt lên mạng xã hội.
// OWNER APPROVAL → CHỌN KÊNH → LỊCH → ĐĂNG → XÁC MINH (đọc lại bài) → SỐ LIỆU.
// Luật cứng: chỉ video "approved"; một video một bài mỗi kênh (dedupe_key); PUBLISHED chỉ khi nền tảng trả mã bài
// và đọc lại được bài (permalink). Chế độ thử dựng đủ yêu cầu nhưng không gọi nền tảng, không bao giờ thành "đã đăng".
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { and, desc, eq, inArray, isNotNull, lte } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getSetting } from "@/lib/admin";
import { logActivity } from "@/lib/activity";
import { sendAlert } from "@/lib/alerts";
import { campaignRepo } from "@/lib/campaigns/repository";
import { EXTRA_FANPAGES, connectorFor, fanpageKey } from "@/lib/connectors/registry";
import { connectorContext, finishRun, readIntegrationConfig, startRun } from "@/lib/connectors/config";
import { CAPTION_LIMITS } from "@/lib/content/formats";
import { buildCaption, captionDraft } from "./caption";
import { getUpload, uploadPath, uploadsDir } from "@/lib/uploads";
import { latestJob } from "@/lib/video/jobs";

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
const g = globalThis as unknown as { __baorPublishing?: Set<string> };
const inFlight = (g.__baorPublishing ??= new Set<string>());

const nowIso = () => new Date().toISOString();
const newId = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export function isDryRun(): boolean {
  return getSetting("publishing.dryRun") !== "0";
}

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

export function scheduleVideoPosts(input: { videoId: string; platforms: string[]; whenIso: string; caption: string; by: string }): ScheduleResult {
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
  // Chống đăng trùng: bài thật đã lên lịch/đã đăng thì không tạo lại; bài lỗi/huỷ cho phép tạo lại.
  const keys = platforms.map((p) => `${p}:${v.id}`);
  const existing = db.select().from(schema.scheduledPosts).where(inArray(schema.scheduledPosts.dedupeKey, keys)).all();
  // Bài lỗi nhưng nền tảng ĐÃ nhận video (có externalId) vẫn tính là đã đăng: không lên lịch lại để tránh trùng.
  // Bài lỗi MƠ HỒ (có thể đã lên trang) cũng tính là còn sống: chỉ đăng lại qua "Thử lại" kèm ghi chú đã kiểm tra trang.
  const live = existing.filter((e) => (e.status !== "failed" && e.status !== "cancelled") || !!e.externalId || isAmbiguousFailure(e));
  if (!dry && live.some((e) => e.status === "failed" && !e.externalId))
    return { ok: false, error: `Bài trên ${live.filter((e) => isAmbiguousFailure(e)).map((e) => e.platform).join(", ")} lỗi mơ hồ, có thể đã lên trang. Kiểm tra trang rồi dùng “Thử lại” (ghi lại đã kiểm tra), không lên lịch mới.` };
  if (!dry && live.length) return { ok: false, error: `Video đã có bài trên ${live.map((e) => e.platform).join(", ")} (${live.map((e) => e.status).join(", ")}). Không đăng trùng.` };
  const thumb = makeThumbnail(masterPath, v.title, input.by);
  const rows = platforms.map((p) => ({
    id: newId("sp"),
    contentId: v.contentId ?? "",
    title: v.title,
    platform: p,
    scheduledFor: new Date(when).toISOString(),
    status: "scheduled",
    videoId: v.id,
    caption,
    thumbnailUploadId: thumb,
    mode: dry ? "dry_run" : "live",
    dedupeKey: dry ? null : `${p}:${v.id}`,
  }));
  db.transaction((tx) => {
    // Bài lỗi/huỷ cũ nhả khoá chống trùng để bài mới thay thế (lịch sử vẫn giữ).
    if (!dry) for (const e of existing.filter((x) => !x.externalId)) tx.update(schema.scheduledPosts).set({ dedupeKey: null }).where(eq(schema.scheduledPosts.id, e.id)).run();
    tx.insert(schema.scheduledPosts).values(rows).run();
  });
  for (const r of rows) campaignRepo.inheritLinks("video", v.id, "publication", r.id, "scheduled");
  logActivity("human", `${input.by} lên lịch đăng video “${v.title}” lên ${platforms.join(", ")}${dry ? " (chế độ thử, không đăng thật)" : ""}.`, "publishing");
  return { ok: true, created: rows.length, mode: dry ? "dry_run" : "live" };
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
  // Máy chủ khởi động lại giữa lúc đăng: không tự đăng lại (có thể đã lên), đánh lỗi để người kiểm tra.
  for (const p of db.select().from(schema.scheduledPosts).where(eq(schema.scheduledPosts.status, "publishing")).all()) {
    if (p.videoId && !inFlight.has(p.id)) {
      db.update(schema.scheduledPosts).set({ status: "failed", error: `${AMBIGUOUS_MARK} Máy chủ dừng giữa lúc đăng. Kiểm tra trang trước khi thử lại để tránh đăng trùng.` }).where(eq(schema.scheduledPosts.id, p.id)).run();
    }
  }
  const due = db
    .select()
    .from(schema.scheduledPosts)
    .where(and(eq(schema.scheduledPosts.status, "scheduled"), lte(schema.scheduledPosts.scheduledFor, nowIso())))
    .all()
    .filter((p) => p.videoId);
  for (const post of due) {
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
    // Giành quyền đăng nguyên tử: hai lượt chạy song song không cùng đăng một bài.
    const claim = db.update(schema.scheduledPosts).set({ status: "publishing", attempts: post.attempts + 1 }).where(and(eq(schema.scheduledPosts.id, post.id), eq(schema.scheduledPosts.status, "scheduled"))).run();
    if (claim.changes !== 1) continue;
    inFlight.add(post.id);
    const runId = startRun(st.channel.key, "publish_video");
    try {
      const connector = connectorFor(st.channel.key)!;
      const res = await connector.publishVideo!(connectorContext(st.channel.key), { postId: post.id, title: post.title, description: post.caption ?? "", filePath: file.path, fileName: file.name, fileSize: file.size });
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
      inFlight.delete(post.id);
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
    if (!connector?.verifyPost || !p.externalId) continue;
    const r = await connector.verifyPost(connectorContext(st.channel!.key), p.externalId);
    if (r.ok && r.permalink) {
      const at = nowIso();
      db.update(schema.scheduledPosts).set({ status: "published", permalink: r.permalink, verifiedAt: at, publishedAt: r.publishedAt ?? p.publishedAt ?? at, error: null }).where(eq(schema.scheduledPosts.id, p.id)).run();
      campaignRepo.syncEntityStatus("publication", p.id, "published");
      if (p.contentId) db.update(schema.contentItems).set({ status: "published" }).where(eq(schema.contentItems.id, p.contentId)).run();
      logActivity("system", `Đã đăng và xác minh “${p.title}” trên ${p.platform}: ${r.permalink}`, "publishing");
      out.verified++;
    } else if (p.publishedAt && Date.now() - Date.parse(p.publishedAt) > VERIFY_GIVE_UP_MS) {
      db.update(schema.scheduledPosts).set({ status: "failed", error: `Không xác minh được sau 24 giờ: ${r.message}. Kiểm tra trang (mã ${p.externalId}).` }).where(eq(schema.scheduledPosts.id, p.id)).run();
    } else {
      db.update(schema.scheduledPosts).set({ error: r.message }).where(eq(schema.scheduledPosts.id, p.id)).run();
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

/** Đánh dấu lỗi mơ hồ (lệnh đăng đã gửi, không rõ bài đã lên chưa): đăng lại phải có xác nhận đã kiểm tra trang. */
export const AMBIGUOUS_MARK = "[CẦN KIỂM TRA TRANG]";

export function isAmbiguousFailure(p: { status: string; error: string | null }): boolean {
  return p.status === "failed" && (p.error ?? "").startsWith(AMBIGUOUS_MARK);
}

export function retryVideoPost(postId: string, checkedNote?: string): { ok: boolean; error?: string } {
  const db = getDb();
  const p = db.select().from(schema.scheduledPosts).where(eq(schema.scheduledPosts.id, postId)).get();
  if (!p?.videoId) return { ok: false, error: "Không tìm thấy bài video" };
  if (p.status !== "failed") return { ok: false, error: "Chỉ thử lại bài lỗi" };
  if (p.externalId) return { ok: false, error: `Nền tảng đã nhận video (mã ${p.externalId}). Kiểm tra trang, không đăng lại để tránh trùng.` };
  if (isAmbiguousFailure(p) && (checkedNote ?? "").trim().length < 10) {
    return { ok: false, error: "Lần trước lệnh đăng đã gửi nhưng không rõ kết quả: kiểm tra trang trước, rồi ghi xác nhận (vd 'Đã mở trang lúc 10:05, không thấy bài')." };
  }
  db.update(schema.scheduledPosts).set({ status: "scheduled", scheduledFor: nowIso(), error: null }).where(eq(schema.scheduledPosts.id, postId)).run();
  return { ok: true };
}

export function cancelVideoPost(postId: string): { ok: boolean; error?: string } {
  const db = getDb();
  const p = db.select().from(schema.scheduledPosts).where(eq(schema.scheduledPosts.id, postId)).get();
  if (!p?.videoId) return { ok: false, error: "Không tìm thấy bài video" };
  if (p.status !== "scheduled") return { ok: false, error: "Chỉ huỷ được bài đang chờ đăng" };
  db.update(schema.scheduledPosts).set({ status: "cancelled", dedupeKey: null }).where(eq(schema.scheduledPosts.id, postId)).run();
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
