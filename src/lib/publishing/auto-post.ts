// Bước 2 · Đăng (OWNER 05/11/2026): mỗi video đã duyệt một hàng, MỖI NỀN TẢNG MỘT NÚT — bấm là đăng ngay, hoặc chọn giờ cho nền tảng
// đó; nút "Tự động" = GPT đọc video đã duyệt (lời đã nói + ghi chú) → viết bài → tự xếp vào khung giờ vàng còn trống; công tắc
// "Tự động cho video mới" áp cho video vừa vào Kho (kéo vào thư mục VIDEO-DA-DUYET, tải lên, duyệt). Đăng thật hay chế độ thử do
// publishing.dryRun quyết (scheduleVideoPosts); mọi luật chống trùng / kênh chưa nối / caption vượt trần vẫn ở scheduleVideoPosts.
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getSetting, setSetting } from "@/lib/admin";
import { logActivity } from "@/lib/activity";
import { generateCaption } from "@/lib/ai";
import { buildCaption, buildPostTitle, captionDraft, postTitle, saveCaptionDraft, savePostTitle, setPostDraftSource } from "./caption";
import { goldenHours, suggestPostTimes } from "./post-times";
import { channelStatus, isDryRun, scheduleVideoPosts, videoChannels, videoPostsFor, type ScheduleResult } from "./video";

type PostRow = typeof schema.scheduledPosts.$inferSelect;

/** Trạng thái một nền tảng của một video (ô trên trang Đăng). */
export type SlotState = "none" | "scheduled" | "publishing" | "verifying" | "published" | "failed" | "overdue" | "dry_run";

export interface PlatformSlot {
  platform: string;
  label: string;
  /** Đăng được từ đây (kênh nối + có adapter, hoặc đang chế độ thử). */
  usable: boolean;
  /** Lý do khi không đăng được / chưa nối. */
  reason: string;
  /** Kênh chưa có adapter (Instagram / TikTok / YouTube): không bấm được dù chế độ thử. */
  blocked: boolean;
  state: SlotState;
  /** Bài gần nhất của nền tảng này (bài huỷ không tính). */
  post: PostRow | null;
}

const ACTIVE = new Set<SlotState>(["scheduled", "publishing", "verifying", "published"]);

/** Ô theo nền tảng cho một video: kênh gốc + fanpage thêm (videoChannels). Bài mới nhất (theo giờ đăng) chưa huỷ quyết định trạng thái. */
export function platformSlots(videoId: string): PlatformSlot[] {
  const posts = videoPostsFor(videoId).filter((p) => p.status !== "cancelled").sort((a, b) => b.scheduledFor.localeCompare(a.scheduledFor));
  const dry = isDryRun();
  // Fanpage phụ (2–4) chỉ hiện khi đã kết nối: chưa nối thì không chiếm ô (vẫn lên lịch được ở khung Sửa bài nếu cần)
  const channels = videoChannels().filter((c) => !/^facebook_page_\d+$/.test(c.platform) || channelStatus(c.platform).connected);
  return channels.map((c) => {
    const st = channelStatus(c.platform);
    const post = posts.find((p) => p.platform === c.platform) ?? null;
    const state = (post ? (post.status as SlotState) : "none") satisfies SlotState;
    return { platform: c.platform, label: c.label, usable: !c.blocked && (st.canPublish || dry), reason: st.reason, blocked: !!c.blocked, state, post };
  });
}

/** Nền tảng còn đăng được cho video (chưa có bài đang chờ / đã đăng, kênh dùng được). */
export function openPlatforms(videoId: string): string[] {
  return platformSlots(videoId)
    .filter((s) => s.usable && !ACTIVE.has(s.state))
    .map((s) => s.platform);
}

/**
 * Bảo đảm video có bài (tiêu đề + nội dung) trước khi đăng: bản nháp đã có → dùng; chưa có → GPT (AI Viết bài đăng, qua cổng AI)
 * đọc lời đã nói + ghi chú; AI tắt / thiếu khoá / lỗi → bản theo luật, ghi rõ nguồn. Trả caption + title để xếp lịch.
 */
export async function ensurePostDraft(videoId: string): Promise<{ caption: string; title: string; source: "ai" | "rule" | "kept" }> {
  const have = captionDraft(videoId);
  if (have) return { caption: have, title: postTitle(videoId) ?? buildPostTitle(videoId), source: "kept" };
  let reason = "";
  try {
    const r = await generateCaption(videoId, { keepExisting: true });
    if (r.ok) return { caption: captionDraft(videoId) ?? r.text, title: postTitle(videoId) ?? r.title, source: "ai" };
    reason = r.error;
  } catch (e) {
    reason = e instanceof Error ? e.message : String(e);
  }
  const again = captionDraft(videoId);
  if (again) return { caption: again, title: postTitle(videoId) ?? buildPostTitle(videoId), source: "kept" };
  const base = buildCaption(videoId);
  const title = buildPostTitle(videoId);
  if (base.text) {
    saveCaptionDraft(videoId, base.text);
    savePostTitle(videoId, title);
    setPostDraftSource(videoId, `rule: ${reason || "AI không viết được"}`);
  }
  return { caption: base.text, title, source: "rule" };
}

/** Đăng một video lên MỘT nền tảng: ngay (whenIso bỏ trống = bây giờ, bộ chạy nền gửi trong phút tới) hoặc đúng giờ chọn. */
export async function postVideoTo(i: { videoId: string; platform: string; whenIso?: string; by: string }): Promise<ScheduleResult & { whenIso: string }> {
  const whenIso = i.whenIso ?? new Date().toISOString();
  const d = await ensurePostDraft(i.videoId);
  const r = scheduleVideoPosts({ videoId: i.videoId, platforms: [i.platform], whenIso, caption: d.caption, title: d.title, by: i.by });
  return { ...r, whenIso };
}

/** Đổi giờ một bài đang chờ (chỉ trạng thái "scheduled"; bài lỗi dùng Thử lại, bài đã gửi không đổi được). */
export function rescheduleVideoPost(postId: string, whenIso: string, by: { email: string; name?: string }): { ok: true } | { ok: false; error: string } {
  const db = getDb();
  const p = db.select().from(schema.scheduledPosts).where(eq(schema.scheduledPosts.id, postId)).get();
  if (!p) return { ok: false, error: "Không tìm thấy bài" };
  if (p.status !== "scheduled") return { ok: false, error: "Chỉ đổi giờ được bài đang chờ đăng" };
  const at = Date.parse(whenIso);
  if (!Number.isFinite(at)) return { ok: false, error: "Giờ đăng không hợp lệ" };
  db.update(schema.scheduledPosts).set({ scheduledFor: new Date(at).toISOString() }).where(eq(schema.scheduledPosts.id, postId)).run();
  logActivity("human", `${by.name ?? by.email} đổi giờ đăng bài “${p.title}” (${p.platform}).`, "publishing");
  return { ok: true };
}

const VN = "+07:00";
/** Giá trị ô datetime-local (giờ VN "YYYY-MM-DDTHH:MM") → ISO. */
export function vnLocalToIso(local: string): string | null {
  const at = new Date(`${local.length === 16 ? `${local}:00` : local}${VN}`);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

/**
 * Khung giờ vàng sắp tới còn trống: bỏ khung đã có bài chờ đăng (bất kỳ video nào, trên các nền tảng sắp xếp) để mỗi khung một video,
 * không dồn nhiều bài cùng giờ. Hết khung trống trong 8 ngày → khung gợi ý đầu tiên.
 */
export function nextFreeSlot(platforms: string[], now = new Date()): string {
  const golden = goldenHours("facebook");
  const options = suggestPostTimes(golden.hours, now, 12).map((s) => vnLocalToIso(s.value)).filter((x): x is string => !!x);
  if (!options.length) return new Date(now.getTime() + 15 * 60_000).toISOString();
  const db = getDb();
  const busy = new Set(
    db
      .select({ at: schema.scheduledPosts.scheduledFor })
      .from(schema.scheduledPosts)
      .where(and(eq(schema.scheduledPosts.status, "scheduled"), inArray(schema.scheduledPosts.platform, platforms.length ? platforms : ["-"])))
      .all()
      .map((r) => r.at),
  );
  return options.find((o) => !busy.has(o)) ?? options[0];
}

export type AutoPostResult = { ok: true; created: number; whenIso: string; platforms: string[]; mode: "live" | "dry_run"; source: "ai" | "rule" | "kept" } | { ok: false; error: string };

/** Nút "Tự động": GPT đọc video → viết bài → xếp mọi nền tảng còn mở vào khung giờ vàng trống gần nhất. */
export async function autoPostVideo(i: { videoId: string; by: string; now?: Date }): Promise<AutoPostResult> {
  const platforms = openPlatforms(i.videoId);
  if (!platforms.length) return { ok: false, error: "Không còn nền tảng nào để đăng: đã có bài trên các kênh dùng được, hoặc chưa kết nối kênh nào." };
  const d = await ensurePostDraft(i.videoId);
  if (!d.caption) return { ok: false, error: "Chưa viết được bài cho video này (không có lời nói / kịch bản). Sửa bài rồi đăng." };
  const whenIso = nextFreeSlot(platforms, i.now);
  const r = scheduleVideoPosts({ videoId: i.videoId, platforms, whenIso, caption: d.caption, title: d.title, by: i.by });
  if (!r.ok) return r;
  return { ok: true, created: r.created, whenIso, platforms, mode: r.mode, source: d.source };
}

// ---------- Công tắc "Tự động cho video mới" ----------
const AUTO_KEY = "publishing.autoNew";

export function autoNewEnabled(): boolean {
  return getSetting(AUTO_KEY) === "1";
}

export function setAutoNew(on: boolean, by: { email: string; name?: string }): void {
  setSetting(AUTO_KEY, on ? "1" : "0");
  logActivity("human", `${by.name ?? by.email} ${on ? "bật" : "tắt"} tự động đăng video mới (GPT viết bài → xếp giờ vàng).`, "publishing");
}

/** Gọi sau khi video vào Kho và bài đã viết xong (post-draft): công tắc bật → tự xếp lịch; lỗi chỉ ghi nhật ký, không làm hỏng việc nhận video. */
export async function autoPostIfEnabled(videoId: string): Promise<AutoPostResult | null> {
  if (!autoNewEnabled()) return null;
  try {
    const r = await autoPostVideo({ videoId, by: "Tự động" });
    logActivity("system", r.ok ? `Tự động xếp ${r.created} bài cho video mới (${r.platforms.join(", ")}) lúc ${r.whenIso}${r.mode === "dry_run" ? " — chế độ thử" : ""}.` : `Tự động đăng video mới không xếp được: ${r.error}`, "publishing");
    return r;
  } catch (e) {
    logActivity("system", `Tự động đăng video mới lỗi: ${e instanceof Error ? e.message : String(e)}`, "publishing");
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
