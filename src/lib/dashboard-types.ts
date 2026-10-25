// Kiểu và nhãn của màn Điều hành dùng chung cho máy chủ và trình duyệt (không import CSDL).
export type Priority = "high" | "medium" | "low";

export interface ApprovalItem {
  id: string;
  title: string;
  module: string;
  moduleHref: string;
  actor: string;
  actorType: "agent" | "human";
  sentAt: string;
  priority: Priority;
  kind: "content" | "video" | "schedule" | "workflow" | "customer" | "campaign" | "ad";
}

export type PendingItem = ApprovalItem & { waited: string };

export const kindLabel: Record<ApprovalItem["kind"], string> = {
  content: "Nội dung chờ duyệt",
  video: "Video chờ duyệt",
  schedule: "Lịch đăng cần xác nhận",
  customer: "Khách hàng cần phản hồi",
  workflow: "Quy trình gặp lỗi",
  campaign: "Chiến dịch chờ phê duyệt",
  ad: "Quảng cáo chờ duyệt chi tiền",
};

export const priorityLabel: Record<Priority, { label: string; tone: "brick" | "amber" | "neutral" }> = {
  high: { label: "Cao", tone: "brick" },
  medium: { label: "Trung bình", tone: "amber" },
  low: { label: "Thấp", tone: "neutral" },
};

export interface TimelineItem {
  id: string;
  time: string;
  title: string;
  kind: "post" | "video" | "campaign" | "task";
  platform: string;
  status: "done" | "upcoming" | "needs_confirm";
}

export const timelineStatusLabel: Record<TimelineItem["status"], string> = {
  done: "Đã xong",
  upcoming: "Sắp tới",
  needs_confirm: "Cần xác nhận",
};

export type AgentStatus = "active" | "waiting" | "needs_approval" | "error" | "paused";

export interface AgentInfo {
  id: string;
  name: string;
  task: string;
  status: AgentStatus;
  updatedAt: string;
}

export const agentStatusLabel: Record<AgentStatus, { label: string; tone: "jade" | "neutral" | "amber" | "brick" }> = {
  active: { label: "Đang hoạt động", tone: "jade" },
  waiting: { label: "Đang chờ", tone: "neutral" },
  needs_approval: { label: "Cần phê duyệt", tone: "amber" },
  error: { label: "Gặp lỗi", tone: "brick" },
  paused: { label: "Tạm dừng", tone: "neutral" },
};

export interface SystemStatus {
  level: "ok" | "warn" | "error";
  summary: string;
  agents: AgentInfo[];
  issues: string[];
}
