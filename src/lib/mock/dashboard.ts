// DỮ LIỆU MẪU cho màn Điều hành: video, lịch hôm nay, Agent. Nội dung và khách hàng lấy từ CSDL hiện có.
export type Priority = "high" | "medium" | "low";

export interface ApprovalItem {
  id: string;
  title: string;
  module: string; // tên phân hệ
  moduleHref: string;
  actor: string; // người hoặc Agent thực hiện
  actorType: "agent" | "human";
  sentAt: string;
  priority: Priority;
  kind: "content" | "video" | "schedule" | "workflow" | "customer";
}

export const kindLabel: Record<ApprovalItem["kind"], string> = {
  content: "Nội dung chờ duyệt",
  video: "Video chờ duyệt",
  schedule: "Lịch đăng cần xác nhận",
  customer: "Khách hàng cần phản hồi",
  workflow: "Quy trình Automation gặp lỗi",
};

export const mockApprovals: ApprovalItem[] = [
  { id: "ap-v1", title: "Video “Khách thật test serum 7 ngày” (bản dựng 2)", module: "Video Studio", moduleHref: "/video-studio", actor: "Agent Edit Video", actorType: "agent", sentAt: "2026-09-10T08:10:00+07:00", priority: "high", kind: "video" },
  { id: "ap-s1", title: "Xác nhận lịch đăng 20:30 hôm nay: “Review thật: 30 ngày dùng serum”", module: "Đăng bài & Quảng cáo", moduleHref: "/publishing", actor: "Agent đăng bài", actorType: "agent", sentAt: "2026-09-10T07:00:00+07:00", priority: "medium", kind: "schedule" },
  { id: "ap-w1", title: "Quy trình “Trả lời inbox tự động” gặp lỗi giới hạn API", module: "Automation", moduleHref: "/automation", actor: "Hệ thống", actorType: "agent", sentAt: "2026-09-09T18:05:00+07:00", priority: "high", kind: "workflow" },
];

export const mockVideoPending = 1;

export interface TimelineItem {
  id: string;
  time: string; // HH:mm
  title: string;
  kind: "post" | "video" | "campaign" | "task";
  platform: string; // nền tảng hoặc loại việc, hiển thị ngắn
  status: "done" | "upcoming" | "needs_confirm";
}

export const timelineStatusLabel: Record<TimelineItem["status"], string> = {
  done: "Đã xong",
  upcoming: "Sắp tới",
  needs_confirm: "Cần xác nhận",
};

export const mockTimeline: TimelineItem[] = [
  { id: "t1", time: "07:30", title: "Đăng bài “Routine 3 bước cho mẹ bỉm”", kind: "post", platform: "Facebook", status: "done" },
  { id: "t2", time: "09:00", title: "Chiến dịch “Sale 9.9” bước vào 2 ngày cuối", kind: "campaign", platform: "Quảng cáo", status: "done" },
  { id: "t3", time: "14:00", title: "Chốt kịch bản video tuần sau cho Agent Edit Video", kind: "task", platform: "Việc của tôi", status: "upcoming" },
  { id: "t4", time: "18:00", title: "Xuất bản video “Khách thật test serum 7 ngày”", kind: "video", platform: "TikTok", status: "needs_confirm" },
  { id: "t5", time: "20:30", title: "Đăng bài “Review thật: 30 ngày dùng serum”", kind: "post", platform: "Facebook", status: "upcoming" },
];

export type AgentStatus = "active" | "waiting" | "needs_approval" | "error" | "paused";

export interface AgentInfo {
  id: string;
  name: string;
  task: string;
  status: AgentStatus;
  updatedAt: string;
}

export const mockAgents: AgentInfo[] = [
  { id: "ag1", name: "Agent nghiên cứu Insight", task: "Phân tích 380 inbox tuần này", status: "active", updatedAt: "2026-09-10T08:50:00+07:00" },
  { id: "ag2", name: "Agent viết nội dung", task: "Đã gửi 2 bài chờ duyệt", status: "needs_approval", updatedAt: "2026-09-10T08:40:00+07:00" },
  { id: "ag3", name: "Agent Edit Video", task: "Bản dựng 2 chờ anh phê duyệt", status: "needs_approval", updatedAt: "2026-09-10T08:10:00+07:00" },
  { id: "ag4", name: "Agent đăng bài", task: "Chờ xác nhận lịch 20:30", status: "waiting", updatedAt: "2026-09-10T07:00:00+07:00" },
  { id: "ag5", name: "Agent phân tích hiệu quả", task: "Báo cáo tuần đã cập nhật", status: "paused", updatedAt: "2026-09-10T06:00:00+07:00" },
];

export const agentStatusLabel: Record<AgentStatus, { label: string; tone: "jade" | "neutral" | "amber" | "brick" }> = {
  active: { label: "Đang hoạt động", tone: "jade" },
  waiting: { label: "Đang chờ", tone: "neutral" },
  needs_approval: { label: "Cần phê duyệt", tone: "amber" },
  error: { label: "Gặp lỗi", tone: "brick" },
  paused: { label: "Tạm dừng", tone: "neutral" },
};

export const priorityLabel: Record<Priority, { label: string; tone: "brick" | "amber" | "neutral" }> = {
  high: { label: "Cao", tone: "brick" },
  medium: { label: "Trung bình", tone: "amber" },
  low: { label: "Thấp", tone: "neutral" },
};
