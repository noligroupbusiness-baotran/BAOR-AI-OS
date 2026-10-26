// Danh bạ connector: khóa integrations → adapter. Thêm nền tảng = thêm một dòng ở đây.
import type { Connector } from "./types";
import { facebookPageConnector, metaAdsConnector } from "./meta";
import { notionConnector } from "@/lib/knowledge/notion";
import { youtubeConnector } from "./youtube";
import { claudeKeyConnector, openaiKeyConnector, xaiKeyConnector } from "./ai-keys";

// Nền tảng chưa có adapter thật: vẫn khai báo trường cấu hình để lưu khóa, nhưng "Kiểm tra kết nối" báo rõ.
const pending = (key: string, channels: string[], fields: Connector["fields"], note: string): Connector => ({
  key,
  channels,
  fields,
  pending: note,
  async check() {
    return { ok: false, message: note };
  },
});

// Nhiều fanpage (Personal Brand System 6.2.1.2): Fanpage 2–4 dùng chung adapter Facebook Page, mỗi trang một kết nối riêng (Page ID +
// token riêng). Không nhận webhook Messenger (route webhook chỉ dùng trang chính); số liệu theo mục tiêu kênh có accountId = khoá này.
export const EXTRA_FANPAGES = [2, 3, 4] as const;
export const fanpageKey = (n: number) => `facebook_page_${n}`;
const fanpageConnectors: Connector[] = EXTRA_FANPAGES.map((n) => ({ ...facebookPageConnector, key: fanpageKey(n), channels: [], parseWebhook: undefined }));

export const connectors: Connector[] = [
  facebookPageConnector,
  ...fanpageConnectors,
  metaAdsConnector,
  pending("instagram", ["facebook_page"], [{ key: "igUserId", label: "Instagram Business ID" }], "Adapter Instagram chưa xây; sẽ dùng chung token Facebook Page."),
  pending("tiktok", ["tiktok"], [{ key: "accessToken", label: "Access Token", secret: true }], "Adapter TikTok for Business chưa xây; cần app TikTok được duyệt."),
  // YouTube: API key đọc bình luận công khai (Nghiên cứu); đăng video (OAuth) chưa mở — src/lib/publishing/video.ts báo chặn riêng
  youtubeConnector,
  pending("zalo_oa", ["zalo_oa"], [{ key: "oaId", label: "OA ID" }, { key: "accessToken", label: "Access Token", secret: true }], "Adapter Zalo OA chưa xây; cần OA đã xác thực."),
  pending("website", ["website_seo"], [{ key: "siteUrl", label: "Địa chỉ website", hint: "https://tenmien.com" }, { key: "gaPropertyId", label: "GA4 Property ID" }], "Adapter GA4 chưa xây; form website có thể gửi lead qua webhook /api/webhooks/lead ngay."),
  pending("email_provider", ["email"], [{ key: "smtpUrl", label: "SMTP URL", secret: true, hint: "smtp://user:pass@host:587" }, { key: "from", label: "Tên và email gửi", hint: "BAOR <hello@tenmien.com>" }], "Gửi email thật chưa bật; cần nhà cung cấp SMTP."),
  notionConnector,
  claudeKeyConnector,
  openaiKeyConnector,
  xaiKeyConnector,
];

export function connectorFor(key: string): Connector | undefined {
  return connectors.find((c) => c.key === key);
}

export function connectorForChannel(channel: string): Connector | undefined {
  return connectors.find((c) => c.channels.includes(channel) && (c.metrics || c.publish));
}
