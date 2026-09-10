// Nhãn tiếng Việt và tone màu cho phân hệ Chiến dịch. Giao diện không in mã trạng thái thô.
import type { Tone } from "@/components/ui/pill";
import type { ApprovalStatus, ApprovalType, CampaignStatus, ChannelGoalStatus, LinkedEntityType } from "./types";

export const campaignStatusLabel: Record<CampaignStatus, { label: string; tone: Tone }> = {
  draft: { label: "Bản nháp", tone: "neutral" },
  pending_approval: { label: "Chờ phê duyệt", tone: "amber" },
  needs_changes: { label: "Cần chỉnh sửa", tone: "amber" },
  approved: { label: "Đã phê duyệt", tone: "jade" },
  active: { label: "Đang thực hiện", tone: "jade" },
  paused: { label: "Tạm dừng", tone: "neutral" },
  ended: { label: "Đã kết thúc", tone: "neutral" },
  error: { label: "Có lỗi", tone: "brick" },
};

// Thứ tự hiển thị trong bộ lọc.
export const campaignStatusOrder: CampaignStatus[] = ["active", "pending_approval", "needs_changes", "approved", "draft", "paused", "ended", "error"];

export const goalStatusLabel: Record<ChannelGoalStatus, { label: string; tone: Tone }> = {
  planned: { label: "Chưa bắt đầu", tone: "neutral" },
  active: { label: "Đang chạy", tone: "jade" },
  paused: { label: "Tạm dừng", tone: "amber" },
  done: { label: "Hoàn thành", tone: "jade" },
  error: { label: "Có lỗi", tone: "brick" },
};

export const approvalTypeLabel: Record<ApprovalType, string> = {
  campaign_change: "Thay đổi chiến dịch",
  channel_goal: "Mục tiêu kênh mới",
  content: "Nội dung",
  video: "Video",
  schedule: "Lịch đăng",
  budget: "Ngân sách",
  automation: "Automation",
};

export const approvalStatusLabel: Record<ApprovalStatus, { label: string; tone: Tone }> = {
  pending: { label: "Chờ phê duyệt", tone: "amber" },
  approved: { label: "Đã phê duyệt", tone: "jade" },
  rejected: { label: "Từ chối", tone: "brick" },
};

// Nhóm hiển thị ở tab "Hoạt động thực hiện" và phân hệ tương ứng để mở.
export const entityTypeLabel: Record<LinkedEntityType, { label: string; plural: string; module: string }> = {
  insight: { label: "Insight", plural: "Insight đang nghiên cứu", module: "Nghiên cứu & Insight" },
  content: { label: "Nội dung", plural: "Nội dung đang viết", module: "Nội dung" },
  asset: { label: "Hình ảnh", plural: "Hình ảnh", module: "Nội dung" },
  video: { label: "Video", plural: "Video đang dựng", module: "Video Studio" },
  approval: { label: "Phê duyệt", plural: "Phê duyệt", module: "Điều hành" },
  publication: { label: "Bài đăng", plural: "Bài đang chờ đăng", module: "Đăng bài & Quảng cáo" },
  ad: { label: "Quảng cáo", plural: "Quảng cáo", module: "Đăng bài & Quảng cáo" },
  lead: { label: "Lead", plural: "Lead đang chăm sóc", module: "Khách hàng" },
  automation_run: { label: "Automation", plural: "Automation đã chạy", module: "Automation" },
  order: { label: "Đơn hàng", plural: "Đơn hàng", module: "Khách hàng" },
  revenue: { label: "Doanh thu", plural: "Doanh thu", module: "Báo cáo" },
};
