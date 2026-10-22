// Hàm tính toán thuần cho Chiến dịch: tiến độ, kiểm tra ngân sách, ROAS, cảnh báo.
// Không truy cập CSDL để dễ kiểm thử và dùng lại ở cả máy chủ lẫn trình duyệt.
import { channelDef } from "@/config/channels";
import type { Campaign, CampaignResult, ChannelGoal, NewChannelGoalInput } from "./types";

export function clampPercent(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function goalProgress(goal: Pick<ChannelGoal, "targetValue" | "currentValue">): number {
  if (goal.targetValue <= 0) return 0;
  return clampPercent((goal.currentValue / goal.targetValue) * 100);
}

// Mức hoàn thành mục tiêu chung: ưu tiên chỉ tiêu chung (nếu có), không thì trung bình các kênh.
export function campaignProgress(campaign: Pick<Campaign, "targetValue">, goals: Pick<ChannelGoal, "targetValue" | "currentValue">[], result?: Pick<CampaignResult, "achievedValue"> | null): number {
  if (campaign.targetValue && campaign.targetValue > 0 && result) {
    return clampPercent((result.achievedValue / campaign.targetValue) * 100);
  }
  if (goals.length === 0) return 0;
  const total = goals.reduce((n, g) => n + goalProgress(g), 0);
  return clampPercent(total / goals.length);
}

export interface BudgetCheck {
  total: number;
  allocated: number;
  remaining: number;
  over: boolean;
}

export function checkBudget(totalBudget: number, goals: Pick<NewChannelGoalInput, "budget">[]): BudgetCheck {
  const allocated = goals.reduce((n, g) => n + (Number.isFinite(g.budget) ? g.budget : 0), 0);
  return { total: totalBudget, allocated, remaining: totalBudget - allocated, over: allocated > totalBudget };
}

export function roas(revenue: number, spent: number): number | null {
  if (spent <= 0 || revenue <= 0) return null;
  return Math.round((revenue / spent) * 100) / 100;
}

export function conversionRate(orders: number, leads: number): number | null {
  if (leads <= 0) return null;
  return Math.round((orders / leads) * 1000) / 10;
}

export function costPerLead(spent: number, leads: number): number | null {
  if (leads <= 0 || spent <= 0) return null;
  return Math.round(spent / leads);
}

// Chiến dịch có chạm vào tháng YYYY-MM không (dùng cho bộ lọc "Thời gian" và chỉ số ngân sách tháng).
export function overlapsMonth(startDate: string, endDate: string, month: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(month)) return true;
  const first = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const last = `${month}-${String(lastDay).padStart(2, "0")}`;
  return startDate <= last && endDate >= first;
}

export function isValidDateRange(start: string, end: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(start) && /^\d{4}-\d{2}-\d{2}$/.test(end) && start <= end;
}

// Cảnh báo cần người xử lý: tài khoản chưa kết nối, ngân sách kênh vượt tổng, lỗi, quá hạn chưa kết thúc.
export function campaignAlerts(campaign: Campaign, goals: ChannelGoal[], connected: Record<string, boolean>, today: string): string[] {
  const out: string[] = [];
  if (campaign.status === "error") out.push("Chiến dịch đang ở trạng thái có lỗi.");
  const budget = checkBudget(campaign.totalBudget, goals);
  if (budget.over) out.push(`Ngân sách kênh (${budget.allocated.toLocaleString("vi-VN")} ₫) vượt ngân sách tổng (${budget.total.toLocaleString("vi-VN")} ₫).`);
  if ((campaign.status === "active" || campaign.status === "approved") && campaign.endDate < today) out.push("Đã qua ngày kết thúc nhưng chiến dịch chưa được đóng.");
  const notConnected = new Set<string>();
  for (const g of goals) {
    if (g.status === "error") out.push(`Mục tiêu kênh ${channelDef(g.channel)?.label ?? g.channel} có lỗi.`);
    const def = channelDef(g.channel);
    const key = g.accountId ?? def?.integrationKey ?? null;
    const isConnected = key ? connected[key] === true : false;
    if (!isConnected && (campaign.status === "active" || campaign.status === "approved")) notConnected.add(def?.label ?? g.channel);
  }
  // Mỗi kênh chưa kết nối chỉ báo một lần, dù có nhiều mục tiêu trên kênh đó.
  for (const label of notConnected) out.push(`Tài khoản ${label} chưa kết nối.`);
  return out;
}

// Nhãn thời gian ngắn cho danh sách: "còn 12 ngày", "bắt đầu sau 3 ngày", "đã qua hạn 2 ngày", "kết thúc hôm nay".
export function timingLabel(startDate: string, endDate: string, today: string): { text: string; tone: "neutral" | "amber" | "brick" } {
  const day = (d: string) => Math.round(Date.parse(`${d}T00:00:00Z`) / 86_400_000);
  const t = day(today);
  const s = day(startDate);
  const e = day(endDate);
  if (t < s) return { text: `bắt đầu sau ${s - t} ngày`, tone: "neutral" };
  if (t > e) return { text: `đã qua hạn ${t - e} ngày`, tone: "brick" };
  const left = e - t;
  if (left === 0) return { text: "kết thúc hôm nay", tone: "amber" };
  return { text: `còn ${left} ngày`, tone: left <= 3 ? "amber" : "neutral" };
}
