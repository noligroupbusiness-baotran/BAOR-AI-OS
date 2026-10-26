// Đào bình luận YouTube cho Nghiên cứu (OWNER 26/10: "AI cần tự tìm… các nỗi đau ở bình luận của các kênh YouTube đúng chủ đề").
// Chỉ dùng YouTube Data API v3 chính thức bằng API key (dữ liệu công khai, đúng điều khoản) — không cào trang, không đăng nhập.
// Luồng: câu tìm tiếng Việt → search.list (video VN, tiếng Việt) → videos.list (đủ bình luận) → commentThreads.list (bình luận nổi bật)
// → làm sạch (bỏ tên / số điện thoại / email / @nhắc tên / link) → phân tích chung với bình luận dán tay (social.ts).
// Riêng tư: KHÔNG đọc / lưu tên, kênh, ảnh người bình luận — chỉ chữ bình luận + id bình luận (để dẫn link tới đúng bình luận).
import { readIntegrationConfig } from "@/lib/connectors/config";
import { YouTubeError, quotaAllows, ytGet, youtubeQuota } from "@/lib/connectors/youtube";
import { cleanComment } from "./social";

export const YT_SETTINGS_HREF = "/settings?tab=ket-noi#youtube";
export const MAX_YT_COMMENTS = 300;

export function youtubeApiKey(): string {
  return readIntegrationConfig("youtube").apiKey || process.env.YOUTUBE_API_KEY || "";
}

export type YtReadiness = { ok: true } | { ok: false; label: string; reason: string; href: string };

/** Trạng thái nút "AI tìm nỗi đau khách" phần YouTube: thiếu khoá / hết hạn mức hôm nay → nhãn ngắn kiểu AiBlocked. */
export function youtubeReadiness(now = new Date()): YtReadiness {
  if (!youtubeApiKey()) return { ok: false, label: "Thiếu khoá YouTube", reason: "Nhập API key YouTube (đọc bình luận) ở Cài đặt › Kết nối › YouTube.", href: YT_SETTINGS_HREF };
  const q = quotaAllows("search", now);
  if (!q.ok) return { ok: false, label: "Hết hạn mức YouTube", reason: q.reason, href: YT_SETTINGS_HREF };
  return { ok: true };
}

/** id video từ link: watch?v=, youtu.be/, /shorts/, /live/, /embed/, m.youtube.com. Không phải link video → null. */
export function parseYouTubeVideoId(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^(?:www|m|music)\./, "");
  const ok = (id: string | null | undefined) => (id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null);
  if (host === "youtu.be") return ok(u.pathname.split("/")[1]);
  if (host !== "youtube.com" && host !== "youtube-nocookie.com") return null;
  if (u.pathname === "/watch") return ok(u.searchParams.get("v"));
  const m = u.pathname.match(/^\/(?:shorts|live|embed|v)\/([^/?#]+)/);
  return ok(m?.[1]);
}

export const videoUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;
/** Link tới ĐÚNG bình luận (tham số lc của YouTube). */
export const commentUrl = (videoId: string, commentId: string) => `${videoUrl(videoId)}&lc=${encodeURIComponent(commentId)}`;

/** Câu tìm dự phòng khi AI tắt / thiếu khoá: lời khách hàng Việt hay gõ quanh chủ đề. */
export function fallbackQueries(topic: string): string[] {
  const t = topic.replace(/^Chủ đề:\s*/i, "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!t) return [];
  return [t, `${t} khó khăn`, `${t} cho người mới bắt đầu`, `kinh nghiệm ${t}`];
}

interface SearchBody {
  items?: { id?: { kind?: string; videoId?: string }; snippet?: { title?: string } }[];
}
interface VideosBody {
  items?: { id?: string; snippet?: { title?: string }; statistics?: { commentCount?: string; viewCount?: string } }[];
}
interface ThreadsBody {
  nextPageToken?: string;
  items?: { id?: string; snippet?: { topLevelComment?: { id?: string; snippet?: { textOriginal?: string; textDisplay?: string; likeCount?: number } } } }[];
}

/** search.list: video Việt Nam, tiếng Việt, liên quan nhất, 2 năm gần đây. 1 lượt trong bể 100 lượt / ngày. */
export async function searchVideos(q: string, apiKey: string, fetchImpl: typeof fetch = fetch, now = new Date()): Promise<{ id: string; title: string }[]> {
  const after = new Date(now.getTime() - 2 * 365 * 86_400_000).toISOString().replace(/\.\d{3}Z$/, "Z");
  const body = await ytGet<SearchBody>("search", { part: "snippet", q, type: "video", regionCode: "VN", relevanceLanguage: "vi", order: "relevance", maxResults: "10", safeSearch: "moderate", publishedAfter: after }, apiKey, fetchImpl, now);
  return (body.items ?? []).filter((i) => i.id?.videoId).map((i) => ({ id: i.id!.videoId!, title: i.snippet?.title ?? "" }));
}

/** videos.list (≤ 50 id, 1 đơn vị): tiêu đề + số bình luận để chọn video đáng đọc. */
export async function videoDetails(ids: string[], apiKey: string, fetchImpl: typeof fetch = fetch, now = new Date()): Promise<{ id: string; title: string; commentCount: number }[]> {
  if (!ids.length) return [];
  const body = await ytGet<VideosBody>("videos", { part: "snippet,statistics", id: ids.slice(0, 50).join(",") }, apiKey, fetchImpl, now);
  return (body.items ?? []).filter((v) => v.id).map((v) => ({ id: v.id!, title: v.snippet?.title ?? "", commentCount: Number(v.statistics?.commentCount ?? 0) || 0 }));
}

/** commentThreads.list: bình luận gốc nổi bật (order=relevance), chữ thuần. Chỉ lấy id + chữ — bỏ tên / kênh tác giả ngay khi đọc. */
export async function videoComments(videoId: string, max: number, apiKey: string, fetchImpl: typeof fetch = fetch, now = new Date()): Promise<{ id: string; text: string }[]> {
  const out: { id: string; text: string }[] = [];
  let pageToken = "";
  for (let page = 0; page < 3 && out.length < max; page++) {
    const params: Record<string, string> = { part: "snippet", videoId, order: "relevance", textFormat: "plainText", maxResults: String(Math.min(100, Math.max(1, max - out.length))) };
    if (pageToken) params.pageToken = pageToken;
    const body = await ytGet<ThreadsBody>("commentThreads", params, apiKey, fetchImpl, now);
    for (const t of body.items ?? []) {
      const c = t.snippet?.topLevelComment;
      const text = c?.snippet?.textOriginal ?? c?.snippet?.textDisplay ?? "";
      if (c?.id && text) out.push({ id: c.id, text });
    }
    if (!body.nextPageToken) break;
    pageToken = body.nextPageToken;
  }
  return out.slice(0, max);
}

export interface MinedComments {
  videos: { id: string; title: string; url: string }[];
  comments: { text: string; url: string }[];
  units: number;
  notes: string[];
}

/** Làm sạch + bỏ trùng + gắn link tới đúng bình luận. */
function collect(videoId: string, raw: { id: string; text: string }[], seen: Set<string>, out: MinedComments["comments"], cap: number) {
  for (const r of raw) {
    if (out.length >= cap) return;
    const text = cleanComment(r.text);
    const key = text.toLowerCase();
    if (text.length < 3 || seen.has(key)) continue;
    seen.add(key);
    out.push({ text, url: commentUrl(videoId, r.id) });
  }
}

/**
 * Tìm và đọc bình luận cho một chủ đề: tối đa 4 câu tìm, chọn tối đa `maxVideos` video có ≥ `minComments` bình luận (giữ thứ tự liên quan),
 * tổng ≤ `maxComments` bình luận đã làm sạch. Hết hạn mức giữa chừng → dừng, trả phần đã đọc kèm ghi chú.
 */
export async function mineYouTube(input: { queries: string[]; apiKey: string; fetch?: typeof fetch; now?: Date; maxVideos?: number; maxComments?: number; minComments?: number }): Promise<MinedComments> {
  const f = input.fetch ?? fetch;
  const now = input.now ?? new Date();
  const maxVideos = input.maxVideos ?? 5;
  const cap = Math.min(input.maxComments ?? MAX_YT_COMMENTS, MAX_YT_COMMENTS);
  const minComments = input.minComments ?? 10;
  const before = youtubeQuota(now).units;
  const notes: string[] = [];
  const out: MinedComments = { videos: [], comments: [], units: 0, notes };
  const candidates: { id: string; title: string }[] = [];
  try {
    for (const q of input.queries.map((x) => x.trim()).filter(Boolean).slice(0, 4)) {
      for (const v of await searchVideos(q, input.apiKey, f, now)) if (!candidates.some((c) => c.id === v.id)) candidates.push(v);
      if (candidates.length >= 25) break;
    }
    const details = await videoDetails(candidates.map((c) => c.id), input.apiKey, f, now);
    const byId = new Map(details.map((d) => [d.id, d]));
    const picked = candidates.map((c) => byId.get(c.id)).filter((d): d is NonNullable<typeof d> => !!d && d.commentCount >= minComments).slice(0, maxVideos);
    const seen = new Set<string>();
    for (const [i, v] of picked.entries()) {
      const left = cap - out.comments.length;
      if (left <= 0) break;
      const share = Math.ceil(left / (picked.length - i));
      try {
        collect(v.id, await videoComments(v.id, share, input.apiKey, f, now), seen, out.comments, cap);
        out.videos.push({ id: v.id, title: v.title, url: videoUrl(v.id) });
      } catch (e) {
        if (e instanceof YouTubeError && (e.reason === "commentsDisabled" || e.reason === "videoNotFound" || e.reason === "forbidden")) continue;
        throw e;
      }
    }
    if (!picked.length) notes.push("YouTube: không thấy video đủ bình luận");
  } catch (e) {
    if (!(e instanceof YouTubeError)) throw e;
    if (!out.comments.length) throw e;
    notes.push(e.message); // hết hạn mức giữa chừng: giữ phần đã đọc
  }
  out.units = youtubeQuota(now).units - before;
  return out;
}

/** Một link video do OWNER dán: đọc bình luận nổi bật của đúng video đó (≤ 300). */
export async function commentsFromVideo(videoId: string, apiKey: string, fetchImpl: typeof fetch = fetch, now = new Date()): Promise<MinedComments> {
  const before = youtubeQuota(now).units;
  const out: MinedComments = { videos: [{ id: videoId, title: "", url: videoUrl(videoId) }], comments: [], units: 0, notes: [] };
  const details = await videoDetails([videoId], apiKey, fetchImpl, now).catch(() => []);
  if (details[0]) out.videos[0].title = details[0].title;
  collect(videoId, await videoComments(videoId, MAX_YT_COMMENTS, apiKey, fetchImpl, now), new Set(), out.comments, MAX_YT_COMMENTS);
  out.units = youtubeQuota(now).units - before;
  return out;
}
