// Danh bạ connector: khóa integrations → adapter. Thêm nền tảng = thêm một dòng ở đây.
import type { Connector } from "./types";
import { facebookPageConnector, metaAdsConnector } from "./meta";

// Nền tảng chưa có adapter thật: vẫn khai báo trường cấu hình để lưu khóa, nhưng "Kiểm tra kết nối" báo rõ.
const pending = (key: string, channels: string[], fields: Connector["fields"], note: string): Connector => ({
  key,
  channels,
  fields,
  async check() {
    return { ok: false, message: note };
  },
});

export const connectors: Connector[] = [
  facebookPageConnector,
  metaAdsConnector,
  pending("instagram", ["facebook_page"], [{ key: "igUserId", label: "Instagram Business ID" }], "Adapter Instagram chưa xây; sẽ dùng chung token Facebook Page."),
  pending("tiktok", ["tiktok"], [{ key: "accessToken", label: "Access Token", secret: true }], "Adapter TikTok for Business chưa xây; cần app TikTok được duyệt."),
  pending("youtube", ["youtube"], [{ key: "channelId", label: "Channel ID" }, { key: "accessToken", label: "OAuth Access Token", secret: true }], "Adapter YouTube Data API chưa xây; cần Google Cloud project."),
  pending("zalo_oa", ["zalo_oa"], [{ key: "oaId", label: "OA ID" }, { key: "accessToken", label: "Access Token", secret: true }], "Adapter Zalo OA chưa xây; cần OA đã xác thực."),
  pending("website", ["website_seo"], [{ key: "siteUrl", label: "Địa chỉ website", hint: "https://tenmien.com" }, { key: "gaPropertyId", label: "GA4 Property ID" }], "Adapter GA4 chưa xây; form website có thể gửi lead qua webhook /api/webhooks/lead ngay."),
  pending("email_provider", ["email"], [{ key: "smtpUrl", label: "SMTP URL", secret: true, hint: "smtp://user:pass@host:587" }, { key: "from", label: "Tên và email gửi", hint: "BAOR <hello@tenmien.com>" }], "Gửi email thật chưa bật; cần nhà cung cấp SMTP."),
  pending("claude", [], [{ key: "apiKey", label: "API key", secret: true, hint: "sk-ant-..." }], "Khóa Claude được kiểm tra khi gọi AI lần đầu."),
];

export function connectorFor(key: string): Connector | undefined {
  return connectors.find((c) => c.key === key);
}

export function connectorForChannel(channel: string): Connector | undefined {
  return connectors.find((c) => c.channels.includes(channel) && (c.metrics || c.publish));
}
