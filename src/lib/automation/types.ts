// Kiểu và cấu hình quy tắc Automation. Quy tắc = khi [trigger] thỏa [condition] thì [action] với [params].
// Mọi quy tắc chạy ở làn "rule" của bộ định tuyến; hành động tiêu tiền hoặc xuất bản luôn cần người duyệt.

export type Trigger = "message_received" | "lead_created" | "lead_stale" | "post_engagement_high" | "campaign_behind" | "ad_cpl_high";
export type Action = "reply_faq" | "reply_price" | "mark_needs_human" | "set_stage" | "tag_lead" | "notify" | "propose_ad" | "pause_ad" | "request_approval";
export type RuleStatus = "draft" | "active" | "paused" | "error";

export interface Condition {
  /** message_received: cách khớp tin nhắn. */
  match?: "complaint" | "phone" | "price" | "faq" | "keyword" | "any";
  keyword?: string;
  /** lead_stale: số giờ không có tương tác. */
  hours?: number;
  /** lead_stale / lead_created: giai đoạn áp dụng. */
  stages?: string[];
  /** post_engagement_high: tỷ lệ tương tác / reach (%) tối thiểu. */
  engagementRate?: number;
  /** campaign_behind: chậm hơn tiến độ thời gian bao nhiêu điểm phần trăm. */
  behindPct?: number;
  /** ad_cpl_high: ngưỡng CPL (₫); bỏ trống dùng hạn mức trong Cài đặt. */
  cplAbove?: number;
}

export interface Params {
  stage?: "new" | "contacted" | "qualified" | "won" | "lost";
  tag?: string;
  /** notify / request_approval: nội dung thông báo. */
  message?: string;
  /** propose_ad: ngân sách ngày (₫). */
  dailyBudget?: number;
}

export interface Rule {
  id: string;
  name: string;
  description: string;
  trigger: Trigger;
  condition: Condition;
  action: Action;
  params: Params;
  priority: number;
  enabled: boolean;
  requiresApproval: boolean;
  campaignId: string | null;
  status: RuleStatus;
  runs: number;
  lastRunAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RuleRun {
  id: string;
  ruleId: string;
  at: string;
  entityType: string | null;
  entityId: string | null;
  ok: boolean;
  message: string;
  decisionId: string | null;
}

export const triggerLabel: Record<Trigger, { label: string; hint: string; kind: "event" | "schedule" }> = {
  message_received: { label: "Khi khách nhắn tin", hint: "Từ Messenger, Zalo, bình luận (qua webhook).", kind: "event" },
  lead_created: { label: "Khi có lead mới", hint: "Từ form website, quảng cáo, nhập tay.", kind: "event" },
  lead_stale: { label: "Khi lead không có tương tác quá N giờ", hint: "Kiểm tra mỗi giờ.", kind: "schedule" },
  post_engagement_high: { label: "Khi bài đăng đạt tương tác cao", hint: "Kiểm tra mỗi giờ trên bài đã đăng.", kind: "schedule" },
  campaign_behind: { label: "Khi mục tiêu kênh chậm tiến độ", hint: "So mức hoàn thành với tỷ lệ thời gian đã trôi.", kind: "schedule" },
  ad_cpl_high: { label: "Khi CPL quảng cáo vượt ngưỡng", hint: "Kiểm tra mỗi giờ trên quảng cáo đang chạy.", kind: "schedule" },
};

export const actionLabel: Record<Action, { label: string; hint: string; spends?: boolean }> = {
  reply_faq: { label: "Trả lời bằng câu chuẩn trong kho FAQ", hint: "Chỉ khi tin nhắn khớp một câu hỏi trong Cài đặt › Câu trả lời chuẩn." },
  reply_price: { label: "Trả lời bảng giá từ danh mục", hint: "Giá lấy từ Cài đặt › Sản phẩm." },
  mark_needs_human: { label: "Chuyển cho người xử lý", hint: "Không trả lời tự động, đưa vào Chờ tôi xử lý." },
  set_stage: { label: "Đổi giai đoạn lead", hint: "VD: có số điện thoại → Đã liên hệ." },
  tag_lead: { label: "Gắn nhãn cho lead", hint: "VD: hỏi giá, gọi lại." },
  notify: { label: "Tạo thông báo cho người quản lý", hint: "Hiện ở Điều hành và chuông thông báo." },
  propose_ad: { label: "Đề xuất chạy quảng cáo", hint: "Tạo quảng cáo ở trạng thái chờ duyệt, không tự chi tiền.", spends: true },
  pause_ad: { label: "Tạm dừng quảng cáo", hint: "Dừng chi tiền ngay, ghi lý do." },
  request_approval: { label: "Tạo yêu cầu phê duyệt", hint: "Đưa vào tab Chờ phê duyệt của chiến dịch." },
};

export const ruleStatusLabel: Record<RuleStatus, { label: string; tone: "jade" | "neutral" | "amber" | "brick" }> = {
  draft: { label: "Bản nháp", tone: "neutral" },
  active: { label: "Đang hoạt động", tone: "jade" },
  paused: { label: "Tạm dừng", tone: "amber" },
  error: { label: "Lỗi cần xử lý", tone: "brick" },
};

export const matchLabel: Record<NonNullable<Condition["match"]>, string> = {
  complaint: "Khiếu nại / bức xúc",
  phone: "Có số điện thoại",
  price: "Hỏi giá",
  faq: "Khớp câu hỏi trong kho FAQ",
  keyword: "Chứa từ khóa",
  any: "Mọi tin nhắn còn lại",
};
