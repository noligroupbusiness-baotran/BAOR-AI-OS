// Giao diện chung cho mọi kết nối nền tảng. Mỗi nền tảng một adapter, cùng bốn việc:
// kiểm tra kết nối, đồng bộ số liệu, đăng bài, nhận webhook. Giao diện không biết nền tảng nào.
export interface ConnectorContext {
  /** Cấu hình đã giải mã (token, id...). Không bao giờ ghi ra log. */
  config: Record<string, string>;
  fetch: typeof fetch;
}

export interface CheckResult {
  ok: boolean;
  account?: string; // tên tài khoản / trang lấy được từ nền tảng
  message: string;
}

export interface MetricSnapshot {
  /** Khóa chỉ số theo src/config/channels.ts: reach, engagement, views, leads, ... */
  metric: string;
  value: number;
  /** Chi phí đã tiêu (VND) nếu nền tảng trả về. */
  spent?: number;
  /** Khoảng thời gian số liệu (YYYY-MM-DD). */
  since: string;
  until: string;
}

export interface PublishRequest {
  postId: string;
  contentId: string;
  title: string;
  message: string;
  platform: string; // facebook | instagram | tiktok | ...
  mediaUrl?: string;
}

export interface PublishResult {
  ok: boolean;
  externalId?: string;
  message: string;
}

export interface InboundMessage {
  externalUserId: string;
  name?: string;
  text: string;
  at: string;
  platform: string;
  threadId?: string;
}

export interface Connector {
  /** Khóa trùng với bảng integrations. */
  key: string;
  /** Kênh trong src/config/channels.ts mà connector này cấp số liệu. */
  channels: string[];
  /** Trường cấu hình cần nhập; secret = mã hóa khi lưu. */
  fields: { key: string; label: string; secret?: boolean; hint?: string }[];
  check(ctx: ConnectorContext): Promise<CheckResult>;
  /** Số liệu tổng của tài khoản trong khoảng ngày (để cập nhật mục tiêu kênh). */
  metrics?(ctx: ConnectorContext, since: string, until: string): Promise<MetricSnapshot[]>;
  publish?(ctx: ConnectorContext, req: PublishRequest): Promise<PublishResult>;
  /** Biến payload webhook thô thành tin nhắn / lead thống nhất. */
  parseWebhook?(body: unknown): InboundMessage[];
}
