// YouTube Data API v3 — CHỈ ĐỌC dữ liệu công khai bằng API key (đọc bình luận cho Nghiên cứu). Đăng video YouTube (OAuth) chưa mở.
// Tài liệu (đọc 26/10/2026):
// - developers.google.com/youtube/v3/getting-started: API key đủ cho phương thức list với dữ liệu công khai ("unauthorized requests only
//   retrieve public data"); hạn mức mặc định 10.000 đơn vị / ngày cho mọi phương thức TRỪ search.list và videos.insert.
// - developers.google.com/youtube/v3/determine_quota_cost: search.list có hạn mức RIÊNG 100 lượt / ngày (mỗi lượt 1); commentThreads.list,
//   videos.list, i18nRegions.list 1 đơn vị / lượt; "Daily quotas reset at midnight Pacific Time (PT)".
// - developers.google.com/youtube/v3/docs/commentThreads/list: part, videoId, maxResults 1–100, order time|relevance, textFormat
//   html|plainText, pageToken; lỗi 403 commentsDisabled.
// API miễn phí (không ghi sổ ₫), nhưng BAOR tự đếm đơn vị theo ngày PT và dừng TRƯỚC hạn mức để không bị Google khoá giữa chừng.
import { getSetting, setSetting } from "@/lib/admin";
import type { CheckResult, Connector } from "./types";

export const YT_API = "https://www.googleapis.com/youtube/v3";
export const YT_TIMEOUT_MS = 20_000;
/** Hạn mức mặc định của Google và ngưỡng BAOR tự dừng (chừa khoảng an toàn cho lượt khác cùng dự án Google Cloud). */
export const YT_DAILY_UNITS = 10_000;
export const YT_STOP_UNITS = 9_000;
export const YT_DAILY_SEARCHES = 100;
export const YT_STOP_SEARCHES = 90;
const QUOTA_KEY = "youtube.quota";

/** Ngày theo giờ Thái Bình Dương (Google đặt lại hạn mức lúc 0 giờ PT). */
export function ptDay(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export interface YtQuota {
  day: string;
  units: number;
  searches: number;
}

export function youtubeQuota(now = new Date()): YtQuota {
  const day = ptDay(now);
  try {
    const q = JSON.parse(getSetting(QUOTA_KEY) ?? "{}") as Partial<YtQuota>;
    if (q.day === day) return { day, units: Number(q.units) || 0, searches: Number(q.searches) || 0 };
  } catch {}
  return { day, units: 0, searches: 0 };
}

function saveQuota(q: YtQuota) {
  setSetting(QUOTA_KEY, JSON.stringify(q));
}

export class YouTubeError extends Error {
  constructor(
    message: string,
    readonly reason: string,
    readonly status = 0,
  ) {
    super(message);
  }
}

export const QUOTA_STOP_MESSAGE = "Đã dùng gần hết hạn mức YouTube miễn phí hôm nay — tạm dừng, mai chạy tiếp (Google đặt lại lúc 14–15 giờ chiều giờ Việt Nam).";

/** Còn đủ hạn mức cho một lượt gọi? (search.list tính cả hai bể: lượt tìm riêng + đơn vị chung để chắc chắn). */
export function quotaAllows(kind: "search" | "list", now = new Date()): { ok: true } | { ok: false; reason: string } {
  const q = youtubeQuota(now);
  if (q.units + 1 > YT_STOP_UNITS) return { ok: false, reason: QUOTA_STOP_MESSAGE };
  if (kind === "search" && q.searches + 1 > YT_STOP_SEARCHES) return { ok: false, reason: QUOTA_STOP_MESSAGE };
  return { ok: true };
}

function spend(kind: "search" | "list", now = new Date()) {
  const q = youtubeQuota(now);
  saveQuota({ ...q, units: q.units + 1, searches: q.searches + (kind === "search" ? 1 : 0) });
}

/** Google báo hết hạn mức → đánh dấu đã hết cho hết ngày PT (không gọi tiếp). */
function exhaust(now = new Date()) {
  saveQuota({ day: ptDay(now), units: YT_DAILY_UNITS, searches: YT_DAILY_SEARCHES });
}

type YtErrorBody = { error?: { code?: number; message?: string; errors?: { reason?: string; message?: string }[] } };

/**
 * Một lượt GET tới YouTube Data API: kiểm hạn mức TRƯỚC khi gọi, đếm 1 đơn vị (Google tính cả lượt lỗi), có hạn chờ. Khoá không bao giờ
 * vào thông báo lỗi. path: search | videos | commentThreads | i18nRegions.
 */
export async function ytGet<T>(path: string, params: Record<string, string>, apiKey: string, fetchImpl: typeof fetch = fetch, now = new Date()): Promise<T> {
  if (!apiKey) throw new YouTubeError("Chưa có API key YouTube (Cài đặt › Kết nối › YouTube).", "noKey");
  const kind = path === "search" ? "search" : "list";
  const allowed = quotaAllows(kind, now);
  if (!allowed.ok) throw new YouTubeError(allowed.reason, "baorQuotaStop");
  const url = new URL(`${YT_API}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("key", apiKey);
  spend(kind, now);
  let res: Response;
  try {
    res = await fetchImpl(url.toString(), { headers: { accept: "application/json" }, signal: AbortSignal.timeout(YT_TIMEOUT_MS) });
  } catch (e) {
    throw new YouTubeError(`Không gọi được YouTube: ${e instanceof Error ? e.message : String(e)}`, "network");
  }
  const json = (await res.json().catch(() => ({}))) as T & YtErrorBody;
  if (!res.ok || json.error) {
    const reason = json.error?.errors?.[0]?.reason ?? `http${res.status}`;
    if (reason === "quotaExceeded" || reason === "dailyLimitExceeded" || reason === "rateLimitExceeded") {
      if (reason !== "rateLimitExceeded") exhaust(now);
      throw new YouTubeError(QUOTA_STOP_MESSAGE, reason, res.status);
    }
    const msg = (json.error?.message ?? `HTTP ${res.status}`).replaceAll(apiKey, "***");
    throw new YouTubeError(`YouTube: ${msg}`, reason, res.status);
  }
  return json;
}

/** Kết nối YouTube trong Cài đặt › Kết nối: API key đọc bình luận (kiểm bằng i18nRegions.list — 1 đơn vị, không cần OAuth). */
export const youtubeConnector: Connector = {
  key: "youtube",
  channels: ["youtube"],
  fields: [
    { key: "apiKey", label: "API key (đọc bình luận)", secret: true, hint: "AIza… — Google Cloud › YouTube Data API v3" },
    { key: "channelId", label: "Channel ID" },
    { key: "accessToken", label: "OAuth Access Token (đăng video — chưa mở)", secret: true },
  ],
  async check(ctx): Promise<CheckResult> {
    const apiKey = ctx.config.apiKey;
    if (!apiKey) return { ok: false, message: "Chưa nhập API key YouTube (đọc bình luận). Đăng video YouTube chưa mở." };
    try {
      await ytGet("i18nRegions", { part: "snippet", hl: "vi" }, apiKey, ctx.fetch);
      return { ok: true, account: "Đọc bình luận", message: "API key YouTube hợp lệ — AI đọc được bình luận công khai. Đăng video YouTube chưa mở." };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  },
};
