// Connector Meta: Facebook Page (đăng bài, insights, Messenger) và Meta Ads (Marketing API).
// Phần dựng request và đọc response tách thành hàm thuần để kiểm thử không cần mạng.
import { createHmac, timingSafeEqual } from "node:crypto";
import type { CheckResult, Connector, ConnectorContext, InboundMessage, MetricSnapshot, PublishRequest, PublishResult } from "./types";

export const GRAPH = "https://graph.facebook.com/v21.0";

type GraphError = { error?: { message?: string; code?: number; type?: string } };

function describe(e: unknown, fallback: string): string {
  if (e && typeof e === "object" && "error" in e) {
    const err = (e as GraphError).error;
    if (err?.message) return `Meta: ${err.message}${err.code ? ` (mã ${err.code})` : ""}`;
  }
  if (e instanceof Error) return `Không gọi được Meta: ${e.message}`;
  return fallback;
}

async function graph<T>(ctx: ConnectorContext, path: string, params: Record<string, string>, init?: RequestInit): Promise<T> {
  const url = new URL(`${GRAPH}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await ctx.fetch(url.toString(), init);
  const json = (await res.json()) as T & GraphError;
  if (!res.ok || json.error) throw json;
  return json;
}

// ---------- Hàm thuần (kiểm thử được) ----------

export interface PageInsightsResponse {
  data?: { name: string; period?: string; values?: { value: number | Record<string, number>; end_time?: string }[] }[];
}

// Cộng dồn giá trị theo ngày của một chỉ số Page Insights.
export function sumInsight(res: PageInsightsResponse, name: string): number {
  const item = res.data?.find((d) => d.name === name);
  if (!item?.values) return 0;
  return item.values.reduce((n, v) => n + (typeof v.value === "number" ? v.value : Object.values(v.value ?? {}).reduce((a, b) => a + b, 0)), 0);
}

export interface AdsInsightsResponse {
  data?: { spend?: string; impressions?: string; clicks?: string; actions?: { action_type: string; value: string }[] }[];
}

// Chi phí (VND) và số lead từ Ads Insights. Lead = onsite lead form + tin nhắn bắt đầu.
export function readAdsInsights(res: AdsInsightsResponse): { spent: number; leads: number; impressions: number; clicks: number } {
  const out = { spent: 0, leads: 0, impressions: 0, clicks: 0 };
  for (const row of res.data ?? []) {
    out.spent += Math.round(Number(row.spend ?? 0));
    out.impressions += Number(row.impressions ?? 0);
    out.clicks += Number(row.clicks ?? 0);
    for (const a of row.actions ?? []) {
      if (a.action_type === "lead" || a.action_type === "onsite_conversion.lead_grouped" || a.action_type === "onsite_conversion.messaging_conversation_started_7d") out.leads += Number(a.value ?? 0);
    }
  }
  return out;
}

export interface MessengerWebhook {
  object?: string;
  entry?: { id: string; time?: number; messaging?: { sender: { id: string }; recipient: { id: string }; timestamp: number; message?: { mid: string; text?: string } }[] }[];
}

// Chỉ lấy tin nhắn văn bản do khách gửi tới Page (bỏ echo, bỏ tin không có text).
export function parseMessengerWebhook(body: unknown): InboundMessage[] {
  const b = body as MessengerWebhook;
  if (b?.object !== "page") return [];
  const out: InboundMessage[] = [];
  for (const entry of b.entry ?? []) {
    for (const ev of entry.messaging ?? []) {
      const text = ev.message?.text?.trim();
      if (!text || ev.sender.id === entry.id) continue;
      out.push({ externalUserId: ev.sender.id, text, at: new Date(ev.timestamp).toISOString(), platform: "facebook", threadId: `${entry.id}:${ev.sender.id}` });
    }
  }
  return out;
}

// Chữ ký webhook: X-Hub-Signature-256 = sha256=HMAC(app_secret, raw body).
export function verifyMetaSignature(appSecret: string, rawBody: string, header: string | null): boolean {
  if (!appSecret || !header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const got = header.slice("sha256=".length);
  if (expected.length !== got.length) return false;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(got, "hex"));
}

// ---------- Facebook Page ----------

export const facebookPageConnector: Connector = {
  key: "facebook_page",
  channels: ["facebook_page"],
  fields: [
    { key: "pageId", label: "Page ID" },
    { key: "pageToken", label: "Page Access Token", secret: true, hint: "Meta for Developers › Graph API Explorer, quyền pages_manage_posts, pages_read_engagement, pages_messaging" },
    { key: "appSecret", label: "App Secret", secret: true, hint: "Dùng để xác minh chữ ký webhook" },
  ],
  async check(ctx): Promise<CheckResult> {
    const { pageId, pageToken } = ctx.config;
    if (!pageId || !pageToken) return { ok: false, message: "Thiếu Page ID hoặc Page Access Token." };
    try {
      const me = await graph<{ id: string; name: string; fan_count?: number }>(ctx, pageId, { fields: "id,name,fan_count", access_token: pageToken });
      return { ok: true, account: me.name, message: `Kết nối tới trang “${me.name}”${me.fan_count ? ` · ${me.fan_count.toLocaleString("vi-VN")} người theo dõi` : ""}.` };
    } catch (e) {
      return { ok: false, message: describe(e, "Không kiểm tra được trang.") };
    }
  },
  async metrics(ctx, since, until): Promise<MetricSnapshot[]> {
    const { pageId, pageToken } = ctx.config;
    const res = await graph<PageInsightsResponse>(ctx, `${pageId}/insights`, { metric: "page_impressions_unique,page_post_engagements", period: "day", since, until, access_token: pageToken });
    return [
      { metric: "reach", value: sumInsight(res, "page_impressions_unique"), since, until },
      { metric: "engagement", value: sumInsight(res, "page_post_engagements"), since, until },
    ];
  },
  async publish(ctx, req: PublishRequest): Promise<PublishResult> {
    const { pageId, pageToken } = ctx.config;
    if (req.platform !== "facebook") return { ok: false, message: `Connector Facebook Page không đăng lên ${req.platform}.` };
    try {
      const body = new URLSearchParams({ message: req.message, access_token: pageToken });
      const res = await graph<{ id: string }>(ctx, `${pageId}/feed`, {}, { method: "POST", body });
      return { ok: true, externalId: res.id, message: `Đã đăng lên Facebook (${res.id}).` };
    } catch (e) {
      return { ok: false, message: describe(e, "Đăng bài thất bại.") };
    }
  },
  parseWebhook: parseMessengerWebhook,
};

// ---------- Meta Ads ----------

export const metaAdsConnector: Connector = {
  key: "meta_ads",
  channels: ["facebook_ads"],
  fields: [
    { key: "adAccountId", label: "Ad Account ID (act_...)" },
    { key: "accessToken", label: "Access Token", secret: true, hint: "Quyền ads_read, ads_management" },
  ],
  async check(ctx): Promise<CheckResult> {
    const { adAccountId, accessToken } = ctx.config;
    if (!adAccountId || !accessToken) return { ok: false, message: "Thiếu Ad Account ID hoặc Access Token." };
    try {
      const acc = await graph<{ id: string; name: string; currency?: string; account_status?: number }>(ctx, adAccountId, { fields: "id,name,currency,account_status", access_token: accessToken });
      return { ok: true, account: acc.name, message: `Tài khoản quảng cáo “${acc.name}” (${acc.currency ?? "?"}), trạng thái ${acc.account_status ?? "?"}.` };
    } catch (e) {
      return { ok: false, message: describe(e, "Không kiểm tra được tài khoản quảng cáo.") };
    }
  },
  async metrics(ctx, since, until): Promise<MetricSnapshot[]> {
    const { adAccountId, accessToken } = ctx.config;
    const res = await graph<AdsInsightsResponse>(ctx, `${adAccountId}/insights`, { fields: "spend,impressions,clicks,actions", time_range: JSON.stringify({ since, until }), access_token: accessToken });
    const r = readAdsInsights(res);
    return [
      { metric: "leads", value: r.leads, spent: r.spent, since, until },
      { metric: "reach", value: r.impressions, spent: r.spent, since, until },
    ];
  },
};
