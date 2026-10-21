// CP05: Meta Marketing API (v26.0). Theo tài liệu chính thức đọc ngày 21/10/2026:
// - POST act_{id}/campaigns: name, objective (OUTCOME_*), status (chỉ ACTIVE/PAUSED khi tạo), special_ad_categories (bắt buộc; [] khi không thuộc nhóm đặc biệt)
// - POST act_{id}/adsets: name, campaign_id, daily_budget, targeting, billing_event, optimization_goal, bid_strategy, start_time, end_time, status
// - POST act_{id}/adcreatives: name, object_story_spec { page_id, video_data { video_id, image_url, message, call_to_action } }
// - POST act_{id}/ads: name, adset_id, creative {"creative_id"}, status
// Luật của BAOR: mọi thứ tạo ra ở PAUSED. Bật (ACTIVE) chỉ qua cổng ủy quyền ngân sách (src/lib/ads/authorization.ts).
// Chưa chạy với tài khoản quảng cáo thật: phải kiểm lại khi OWNER cấp quyền.
import type { ConnectorContext } from "@/lib/connectors/types";
import { readAdsInsights, type AdsInsightsResponse } from "@/lib/connectors/meta";

export const MARKETING = "https://graph.facebook.com/v26.0";

type GraphError = { error?: { message?: string; code?: number } };

export class MetaError extends Error {}

async function call<T>(ctx: ConnectorContext, method: "GET" | "POST", path: string, params: Record<string, string>): Promise<T> {
  const token = ctx.config.accessToken;
  if (!token) throw new MetaError("Thiếu Access Token Meta Ads");
  const url = new URL(`${MARKETING}/${path}`);
  let init: RequestInit = { method };
  if (method === "GET") {
    for (const [k, v] of Object.entries({ ...params, access_token: token })) url.searchParams.set(k, v);
  } else {
    init = { method, body: new URLSearchParams({ ...params, access_token: token }) };
  }
  const res = await ctx.fetch(url.toString(), init);
  const text = await res.text();
  let json: T & GraphError;
  try {
    json = JSON.parse(text) as T & GraphError;
  } catch {
    throw new MetaError(`Meta trả về không phải JSON (HTTP ${res.status})`);
  }
  if (!res.ok || json.error) throw new MetaError(`Meta: ${json.error?.message ?? `HTTP ${res.status}`}${json.error?.code ? ` (mã ${json.error.code})` : ""}`);
  return json;
}

export interface Audience {
  countries: string[];
  ageMin: number;
  ageMax: number;
  /** 1 = nam, 2 = nữ; rỗng = tất cả. */
  genders: number[];
}

export function targetingSpec(a: Audience): string {
  return JSON.stringify({ geo_locations: { countries: a.countries.length ? a.countries : ["VN"] }, age_min: a.ageMin, age_max: a.ageMax, ...(a.genders.length ? { genders: a.genders } : {}) });
}

export interface DraftSpec {
  name: string;
  dailyBudgetVnd: number;
  audience: Audience;
  startAt: string;
  endAt: string;
  pageId: string;
  /** Mã video trên Facebook (bài video đã đăng và xác minh). */
  videoExternalId: string;
  thumbnailUrl: string;
  message: string;
}

export interface DraftIds {
  campaignId: string;
  adsetId: string;
  creativeId: string;
  adId: string;
}

/** Tạo chiến dịch nháp đủ 4 tầng, tất cả PAUSED. Lỗi giữa chừng trả về phần đã tạo để không tạo trùng khi thử lại. */
export async function createPausedDraft(ctx: ConnectorContext, d: DraftSpec, existing: Partial<DraftIds> = {}): Promise<{ ok: true; ids: DraftIds } | { ok: false; ids: Partial<DraftIds>; error: string }> {
  const act = ctx.config.adAccountId;
  const ids: Partial<DraftIds> = { ...existing };
  try {
    if (!act?.startsWith("act_")) throw new MetaError("Ad Account ID phải có dạng act_…");
    if (!ids.campaignId) ids.campaignId = (await call<{ id: string }>(ctx, "POST", `${act}/campaigns`, { name: d.name, objective: "OUTCOME_ENGAGEMENT", status: "PAUSED", special_ad_categories: "[]" })).id;
    if (!ids.adsetId) {
      ids.adsetId = (
        await call<{ id: string }>(ctx, "POST", `${act}/adsets`, {
          name: `${d.name} · nhóm`,
          campaign_id: ids.campaignId,
          // VND không có đơn vị lẻ: số gửi lên là số đồng.
          daily_budget: String(Math.round(d.dailyBudgetVnd)),
          billing_event: "IMPRESSIONS",
          optimization_goal: "THRUPLAY",
          bid_strategy: "LOWEST_COST_WITHOUT_CAP",
          targeting: targetingSpec(d.audience),
          start_time: d.startAt,
          end_time: d.endAt,
          status: "PAUSED",
        })
      ).id;
    }
    if (!ids.creativeId) {
      ids.creativeId = (
        await call<{ id: string }>(ctx, "POST", `${act}/adcreatives`, {
          name: `${d.name} · creative`,
          object_story_spec: JSON.stringify({ page_id: d.pageId, video_data: { video_id: d.videoExternalId, image_url: d.thumbnailUrl, message: d.message, call_to_action: { type: "LEARN_MORE", value: { link: `https://www.facebook.com/${d.pageId}` } } } }),
        })
      ).id;
    }
    if (!ids.adId) ids.adId = (await call<{ id: string }>(ctx, "POST", `${act}/ads`, { name: `${d.name} · quảng cáo`, adset_id: ids.adsetId, creative: JSON.stringify({ creative_id: ids.creativeId }), status: "PAUSED" })).id;
    return { ok: true, ids: ids as DraftIds };
  } catch (e) {
    return { ok: false, ids, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Đổi trạng thái cả 3 tầng có tiêu tiền (chiến dịch, nhóm, quảng cáo). */
export async function setDeliveryStatus(ctx: ConnectorContext, ids: Pick<DraftIds, "campaignId" | "adsetId" | "adId">, status: "ACTIVE" | "PAUSED"): Promise<void> {
  // Dừng: từ ngoài vào trong (chiến dịch trước) để ngắt chi tiêu sớm nhất. Bật: từ trong ra ngoài.
  const order = status === "PAUSED" ? [ids.campaignId, ids.adsetId, ids.adId] : [ids.adId, ids.adsetId, ids.campaignId];
  for (const id of order) await call(ctx, "POST", id, { status });
}

export async function setDailyBudget(ctx: ConnectorContext, adsetId: string, vnd: number): Promise<void> {
  await call(ctx, "POST", adsetId, { daily_budget: String(Math.round(vnd)) });
}

export interface DailyInsight {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  thruplays: number;
}

export interface DailyInsightsResponse extends AdsInsightsResponse {
  data?: (NonNullable<AdsInsightsResponse["data"]>[number] & { date_start?: string; video_thruplay_watched_actions?: { action_type: string; value: string }[] })[];
}

export function readDailyInsights(res: DailyInsightsResponse): DailyInsight[] {
  return (res.data ?? []).map((row) => {
    const base = readAdsInsights({ data: [row] });
    const thru = (row.video_thruplay_watched_actions ?? []).reduce((n, a) => n + Number(a.value ?? 0), 0);
    return { date: row.date_start ?? "", spend: base.spent, impressions: base.impressions, clicks: base.clicks, leads: base.leads, thruplays: thru };
  }).filter((r) => r.date);
}

export async function fetchDailyInsights(ctx: ConnectorContext, campaignId: string, since: string, until: string): Promise<DailyInsight[]> {
  const res = await call<DailyInsightsResponse>(ctx, "GET", `${campaignId}/insights`, { fields: "spend,impressions,clicks,actions,video_thruplay_watched_actions", time_range: JSON.stringify({ since, until }), time_increment: "1" });
  return readDailyInsights(res);
}
