// Cấu hình kênh tập trung cho toàn hệ thống Marketing.
// Mọi phân hệ (Chiến dịch, Nội dung, Đăng bài, Báo cáo...) đọc danh sách kênh từ đây,
// không hard-code ở component. Thêm kênh mới = thêm một phần tử vào CHANNELS.

export type ChannelKey = "facebook_page" | "facebook_ads" | "tiktok" | "youtube" | "zalo_oa" | "website_seo" | "email";

// Loại thực thi của một mục tiêu kênh.
export type ExecutionType = "organic" | "paid" | "nurture" | "lead_gen";

// Chỉ số chính có thể đặt cho một mục tiêu kênh.
export type MetricKey =
  | "leads"
  | "reach"
  | "posts"
  | "videos"
  | "views"
  | "visits"
  | "forms"
  | "emails_sent"
  | "open_rate"
  | "contacts"
  | "engagement"
  | "messages";

export interface ChannelDef {
  key: ChannelKey;
  label: string;
  /** Nhãn ngắn dùng trong bảng và pill. */
  short: string;
  /** Khóa tài khoản trong Cài đặt › Kết nối (bảng integrations). null = chưa có kết nối tương ứng. */
  integrationKey: string | null;
  /** Loại thực thi cho phép trên kênh này. */
  executionTypes: ExecutionType[];
  /** Chỉ số chính có thể chọn; phần tử đầu là mặc định. */
  metrics: MetricKey[];
}

export const CHANNELS: ChannelDef[] = [
  { key: "facebook_page", label: "Facebook Fanpage", short: "Fanpage", integrationKey: "facebook_page", executionTypes: ["organic", "nurture"], metrics: ["reach", "posts", "engagement", "messages"] },
  { key: "facebook_ads", label: "Facebook Ads", short: "FB Ads", integrationKey: "meta_ads", executionTypes: ["paid", "lead_gen"], metrics: ["leads", "reach", "messages"] },
  { key: "tiktok", label: "TikTok", short: "TikTok", integrationKey: "tiktok", executionTypes: ["organic", "paid"], metrics: ["views", "videos", "leads"] },
  { key: "youtube", label: "YouTube", short: "YouTube", integrationKey: "youtube", executionTypes: ["organic", "paid"], metrics: ["views", "videos"] },
  { key: "zalo_oa", label: "Zalo OA", short: "Zalo OA", integrationKey: "zalo_oa", executionTypes: ["nurture", "lead_gen"], metrics: ["contacts", "messages", "leads"] },
  { key: "website_seo", label: "Website & SEO", short: "Website", integrationKey: "website", executionTypes: ["organic", "lead_gen"], metrics: ["visits", "forms", "leads"] },
  { key: "email", label: "Email", short: "Email", integrationKey: "email_provider", executionTypes: ["nurture"], metrics: ["emails_sent", "open_rate", "contacts"] },
];

export const EXECUTION_TYPES: { key: ExecutionType; label: string; hint: string }[] = [
  { key: "organic", label: "Tự nhiên", hint: "Đăng bài, video không trả phí." },
  { key: "paid", label: "Trả phí", hint: "Quảng cáo, chỉ chi tiền khi có phê duyệt." },
  { key: "nurture", label: "Chăm sóc", hint: "Nuôi dưỡng khách đã có: Zalo, email, fanpage." },
  { key: "lead_gen", label: "Thu Lead", hint: "Thu thông tin khách tiềm năng qua form, inbox." },
];

export const METRICS: Record<MetricKey, { label: string; unit: string; isRate?: boolean }> = {
  leads: { label: "Lead", unit: "lead" },
  reach: { label: "Lượt tiếp cận", unit: "lượt" },
  posts: { label: "Bài đăng", unit: "bài" },
  videos: { label: "Video", unit: "video" },
  views: { label: "Lượt xem", unit: "lượt" },
  visits: { label: "Lượt truy cập", unit: "lượt" },
  forms: { label: "Lượt điền form", unit: "form" },
  emails_sent: { label: "Email đã gửi", unit: "email" },
  open_rate: { label: "Tỷ lệ mở", unit: "%", isRate: true },
  contacts: { label: "Khách được chăm sóc", unit: "khách" },
  engagement: { label: "Tương tác", unit: "lượt" },
  messages: { label: "Tin nhắn", unit: "tin" },
};

export function channelDef(key: string): ChannelDef | undefined {
  return CHANNELS.find((c) => c.key === key);
}

export function channelLabel(key: string): string {
  return channelDef(key)?.label ?? key;
}

export function executionLabel(key: string): string {
  return EXECUTION_TYPES.find((e) => e.key === key)?.label ?? key;
}

export function metricLabel(key: string): string {
  return (METRICS as Record<string, { label: string } | undefined>)[key]?.label ?? key;
}

export function metricUnit(key: string): string {
  return (METRICS as Record<string, { unit: string } | undefined>)[key]?.unit ?? "";
}
