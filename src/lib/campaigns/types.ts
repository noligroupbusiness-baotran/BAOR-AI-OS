// Domain model của phân hệ Chiến dịch. Tách khỏi giao diện và khỏi lớp lưu trữ.
// Chiến dịch (cấp 1) là trung tâm đặt mục tiêu; Mục tiêu kênh (cấp 2) trực thuộc chiến dịch;
// mọi dữ liệu phát sinh ở phân hệ khác tham chiếu về chiến dịch qua LinkedMarketingItem.
import type { ChannelKey, ExecutionType, MetricKey } from "@/config/channels";

// Luồng chính: draft → pending_approval → approved → active → ended.
// Bổ sung: needs_changes (bị trả về), paused (tạm dừng), error (có lỗi).
export type CampaignStatus = "draft" | "pending_approval" | "needs_changes" | "approved" | "active" | "paused" | "ended" | "error";

export type ChannelGoalStatus = "planned" | "active" | "paused" | "done" | "error";

// Các loại thực thể có thể gắn vào chiến dịch. Tên khớp với hệ ID dùng chung của hệ thống
// (insight_id, content_id, asset_id, video_id, approval_id, publication_id, ad_id, lead_id,
// automation_run_id, order_id, revenue_id).
export type LinkedEntityType =
  | "insight"
  | "content"
  | "asset"
  | "video"
  | "approval"
  | "publication"
  | "ad"
  | "lead"
  | "automation_run"
  | "order"
  | "revenue";

export type ApprovalType = "campaign_change" | "channel_goal" | "content" | "video" | "schedule" | "budget" | "automation";
export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface Campaign {
  id: string;
  name: string;
  description: string;
  /** Mục tiêu chung, viết bằng lời. VD: "Có 300 khách đăng ký trải nghiệm". */
  objective: string;
  /** Chỉ số đo mục tiêu chung (nhãn tự do) và con số cần đạt, để tính mức hoàn thành. */
  targetMetric: string;
  targetValue: number | null;
  productIds: string[];
  audience: string;
  location: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  totalBudget: number; // VND
  budgetNote: string;
  ownerId: string;
  status: CampaignStatus;
  createdBy: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  approvedBy: string | null;
  approvedAt: string | null;
}

export interface ChannelGoal {
  id: string;
  campaignId: string;
  channel: ChannelKey;
  /** Khóa tài khoản nền tảng trong Cài đặt › Kết nối; null = chưa chọn. */
  accountId: string | null;
  executionType: ExecutionType;
  objective: string;
  primaryMetric: MetricKey;
  targetValue: number;
  currentValue: number;
  budget: number; // VND
  spent: number; // VND, cập nhật từ Đăng bài & Quảng cáo
  ownerId: string;
  status: ChannelGoalStatus;
  startDate: string;
  endDate: string;
  createdAt: string;
  updatedAt: string;
}

// Cấu trúc liên kết dùng chung: Insight, Nội dung, Video, Bài đăng, Lead, Automation...
// đều tham chiếu chiến dịch và mục tiêu kênh qua bản ghi này.
export interface LinkedMarketingItem {
  id: string;
  campaignId: string;
  channelGoalId: string | null;
  entityType: LinkedEntityType;
  entityId: string;
  /** Trạng thái của thực thể tại thời điểm gắn (phân hệ nguồn có thể cập nhật). */
  status: string;
  ownerId: string | null;
  /** Nguồn gốc trực tiếp sinh ra thực thể này (VD: lead sinh từ quảng cáo nào). */
  viaType: LinkedEntityType | null;
  viaId: string | null;
  createdAt: string;
}

export interface CampaignApproval {
  id: string;
  campaignId: string;
  channelGoalId: string | null;
  type: ApprovalType;
  title: string;
  entityType: LinkedEntityType | null;
  entityId: string | null;
  status: ApprovalStatus;
  requestedBy: string;
  requestedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  note: string;
}

// Kết quả tổng của chiến dịch. Giai đoạn này là số liệu mẫu; sau này Báo cáo tổng hợp từ
// bài đăng, quảng cáo, lead và đơn hàng thật.
export interface CampaignResult {
  campaignId: string;
  achievedValue: number; // giá trị đạt được của mục tiêu chung
  leads: number;
  orders: number;
  revenue: number;
  spent: number;
  updatedAt: string;
  source: "sample" | "system";
}

export interface CampaignLog {
  id: number;
  campaignId: string;
  at: string;
  actor: string;
  action: string;
  detail: string;
}

export interface Person {
  id: string;
  name: string;
  role: string;
}

export interface Product {
  id: string;
  name: string;
  brand: string;
  price: number; // VND
  unit: string;
  description: string;
}

export interface PlatformAccount {
  key: string;
  name: string;
  connected: boolean;
  account: string | null;
}

export interface CampaignFilter {
  q?: string;
  status?: CampaignStatus | "";
  product?: string;
  owner?: string;
  month?: string; // YYYY-MM
}

// Dòng trong danh sách chiến dịch: chiến dịch + số liệu gộp từ mục tiêu kênh.
export interface CampaignSummary extends Campaign {
  ownerName: string;
  productNames: string[];
  goalCount: number;
  channelCount: number;
  progress: number; // 0-100
  alerts: number;
}

export interface NewChannelGoalInput {
  channel: ChannelKey;
  accountId: string | null;
  executionType: ExecutionType;
  objective: string;
  primaryMetric: MetricKey;
  targetValue: number;
  budget: number;
  ownerId: string;
  startDate: string;
  endDate: string;
}

export interface NewCampaignInput {
  name: string;
  objective: string;
  targetMetric: string;
  targetValue: number | null;
  description: string;
  productIds: string[];
  audience: string;
  location: string;
  ownerId: string;
  startDate: string;
  endDate: string;
  totalBudget: number;
  budgetNote: string;
  goals: NewChannelGoalInput[];
}

export interface CampaignStats {
  active: number;
  pendingApproval: number;
  monthBudget: number;
  alerts: number;
}
