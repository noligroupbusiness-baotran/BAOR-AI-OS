// Connector Meta: Facebook Page (đăng bài, insights, Messenger) và Meta Ads (Marketing API).
// Phần dựng request và đọc response tách thành hàm thuần để kiểm thử không cần mạng.
import { createHmac, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import { Readable } from "node:stream";
import type { CheckResult, Connector, ConnectorContext, InboundMessage, MetricSnapshot, PostMetrics, PublishRequest, PublishResult, VerifyPostResult, VideoPublishRequest } from "./types";

export const GRAPH = "https://graph.facebook.com/v21.0";
/** Đăng video theo hướng dẫn Video API hiện hành (Resumable Upload API → /{page-id}/videos), bản v26.0. */
export const GRAPH_VIDEO = "https://graph.facebook.com/v26.0";

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

// ---------- Facebook Page: đăng video (CP04) ----------
// Bước 1: POST /{app-id}/uploads?file_name&file_length&file_type=video/mp4 (User token) → { id: "upload:<phiên>" }
// Bước 2: POST /upload:<phiên>, header "Authorization: OAuth <User token>", "file_offset: 0", thân = tệp → { h: "<handle>" }
// Bước 3: POST /{page-id}/videos, form access_token (Page token), title, description, fbuploader_video_file_chunk=<handle> → { id }
// Nguồn: developers.facebook.com/documentation/video-api/guides/publishing (đọc 21/10/2026). Chưa chạy với tài khoản Meta thật.

async function readJson<T>(res: Response): Promise<T & GraphError> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T & GraphError;
  } catch {
    return { error: { message: `Phản hồi không phải JSON (HTTP ${res.status})` } } as T & GraphError;
  }
}

export async function publishPageVideo(ctx: ConnectorContext, req: VideoPublishRequest): Promise<PublishResult> {
  const { pageId, pageToken, appId, userToken } = ctx.config;
  if (!pageId || !pageToken || !appId || !userToken) return { ok: false, message: "Thiếu Page ID, Page token, App ID hoặc User token để đăng video." };
  try {
    const start = new URL(`${GRAPH_VIDEO}/${appId}/uploads`);
    start.searchParams.set("file_name", req.fileName);
    start.searchParams.set("file_length", String(req.fileSize));
    start.searchParams.set("file_type", "video/mp4");
    start.searchParams.set("access_token", userToken);
    const r1 = await ctx.fetch(start.toString(), { method: "POST" });
    const j1 = await readJson<{ id?: string }>(r1);
    if (!r1.ok || j1.error || !j1.id?.startsWith("upload:")) throw j1;

    const body = Readable.toWeb(fs.createReadStream(req.filePath)) as unknown as ReadableStream<Uint8Array>;
    const r2 = await ctx.fetch(`${GRAPH_VIDEO}/${j1.id}`, {
      method: "POST",
      headers: { Authorization: `OAuth ${userToken}`, file_offset: "0", "Content-Length": String(req.fileSize) },
      body,
      duplex: "half",
    } as RequestInit);
    const j2 = await readJson<{ h?: string }>(r2);
    if (!r2.ok || j2.error || !j2.h) throw j2;

    const form = new URLSearchParams({ access_token: pageToken, title: req.title, description: req.description, fbuploader_video_file_chunk: j2.h });
    // Từ đây lệnh đăng đã gửi: lỗi mạng / phản hồi hỏng nghĩa là Meta CÓ THỂ đã tạo bài → không tự thử lại.
    let r3: Response;
    let j3: { id?: string } & GraphError;
    try {
      r3 = await ctx.fetch(`${GRAPH_VIDEO}/${pageId}/videos`, { method: "POST", body: form });
      j3 = await readJson<{ id?: string }>(r3);
    } catch (e) {
      return { ok: false, ambiguous: true, message: `Đã gửi lệnh đăng nhưng không nhận được phản hồi (${e instanceof Error ? e.message : e}). Kiểm tra trang trước khi thử lại.` };
    }
    if (j3.error?.message?.startsWith("Phản hồi không phải JSON")) return { ok: false, ambiguous: true, message: `${j3.error.message}. Kiểm tra trang trước khi thử lại.` };
    if (!r3.ok || j3.error || !j3.id) throw j3;
    return { ok: true, externalId: j3.id, message: `Meta nhận video (mã ${j3.id}), đang xác minh.` };
  } catch (e) {
    return { ok: false, message: describe(e, "Đăng video thất bại.") };
  }
}

/** Đọc lại video từ Meta: chỉ coi là đã đăng khi có permalink_url. */
export async function verifyPageVideo(ctx: ConnectorContext, externalId: string): Promise<VerifyPostResult> {
  const { pageToken } = ctx.config;
  try {
    const v = await graph<{ id: string; permalink_url?: string; created_time?: string; status?: { video_status?: string } }>(ctx, externalId, { fields: "id,permalink_url,created_time,status", access_token: pageToken });
    // permalink có thể có từ lúc video còn đang xử lý: nếu Meta trả trạng thái thì phải là "ready".
    if (v.status?.video_status && v.status.video_status !== "ready") return { ok: false, message: `Video trên Meta đang ở trạng thái “${v.status.video_status}”, chưa hiển thị công khai.` };
    if (!v.permalink_url) return { ok: false, message: "Meta chưa trả đường dẫn bài (video có thể đang xử lý)." };
    const permalink = v.permalink_url.startsWith("http") ? v.permalink_url : `https://www.facebook.com${v.permalink_url}`;
    return { ok: true, permalink, publishedAt: v.created_time, message: "Đã đọc lại bài trên Facebook." };
  } catch (e) {
    return { ok: false, message: describe(e, "Không đọc lại được video.") };
  }
}

export interface VideoInsightsResponse {
  data?: { name: string; values?: { value: number }[] }[];
}

export function readVideoInsights(res: VideoInsightsResponse): PostMetrics {
  const get = (n: string) => res.data?.find((d) => d.name === n)?.values?.[0]?.value;
  return { views: get("total_video_views"), reach: get("total_video_impressions_unique") };
}

export async function pageVideoMetrics(ctx: ConnectorContext, externalId: string): Promise<PostMetrics> {
  const res = await graph<VideoInsightsResponse>(ctx, `${externalId}/video_insights`, { metric: "total_video_views,total_video_impressions_unique", access_token: ctx.config.pageToken });
  return readVideoInsights(res);
}

// ---------- Facebook Page ----------

export const facebookPageConnector: Connector = {
  key: "facebook_page",
  channels: ["facebook_page"],
  fields: [
    { key: "pageId", label: "Page ID" },
    { key: "pageToken", label: "Page Access Token", secret: true, hint: "Meta for Developers › Graph API Explorer, quyền pages_manage_posts, pages_read_engagement, pages_messaging" },
    { key: "appSecret", label: "App Secret", secret: true, hint: "Dùng để xác minh chữ ký webhook" },
    { key: "appId", label: "App ID", hint: "Đăng video: Resumable Upload API cần App ID" },
    { key: "userToken", label: "User Access Token", secret: true, hint: "Đăng video: tải tệp lên Meta bằng token người dùng có quyền CREATE_CONTENT trên trang" },
    { key: "tokenExpiresAt", label: "Token hết hạn ngày (YYYY-MM-DD)", hint: "Token trang dài hạn thường 60 ngày; hệ thống nhắc trước 7 ngày" },
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
  publishVideo: publishPageVideo,
  verifyPost: verifyPageVideo,
  postMetrics: pageVideoMetrics,
  parseWebhook: parseMessengerWebhook,
};

// ---------- Meta Ads ----------

export const metaAdsConnector: Connector = {
  key: "meta_ads",
  channels: ["facebook_ads"],
  fields: [
    { key: "adAccountId", label: "Ad Account ID (act_...)" },
    { key: "accessToken", label: "Access Token", secret: true, hint: "Quyền ads_read, ads_management" },
    { key: "tokenExpiresAt", label: "Token hết hạn ngày (YYYY-MM-DD)", hint: "Hệ thống nhắc trước 7 ngày" },
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
