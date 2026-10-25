// Kiểu và hằng dùng chung giữa máy chủ và trình duyệt cho vỏ ứng dụng (không import CSDL).
export interface Health {
  level: "ok" | "warn" | "error";
  summary: string;
  connectedCount: number;
  realCount: number;
  schedulerRunning: boolean;
  lastTickAt: string | null;
  lastResult: string;
  aiSpentPct: number;
  failedRuns24h: number;
  issues: string[];
}

export type NotificationGroup = "approval" | "due" | "error" | "activity";

export interface NotificationItem {
  id: string;
  group: NotificationGroup;
  type: string;
  text: string;
  at: string;
  href: string;
}

export const notificationGroups: { key: NotificationGroup; label: string }[] = [
  { key: "approval", label: "Chờ phê duyệt" },
  { key: "due", label: "Việc đến hạn" },
  { key: "error", label: "Lỗi cần xử lý" },
  { key: "activity", label: "Hoạt động gần đây" },
];
