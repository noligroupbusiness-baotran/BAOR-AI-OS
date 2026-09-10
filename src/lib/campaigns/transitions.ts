import type { CampaignStatus, ChannelGoalStatus } from "./types";

// Máy trạng thái chiến dịch: hành động nào được phép từ trạng thái nào.
// Tách khỏi server action để kiểm thử được và dùng chung cho UI (ẩn/hiện nút).
export type CampaignAction = "submit" | "approve" | "request_changes" | "activate" | "pause" | "end";

export const campaignTransitions: Record<CampaignAction, { from: CampaignStatus[]; to: CampaignStatus }> = {
  submit: { from: ["draft", "needs_changes"], to: "pending_approval" },
  approve: { from: ["pending_approval"], to: "approved" },
  request_changes: { from: ["pending_approval"], to: "needs_changes" },
  activate: { from: ["approved", "paused"], to: "active" },
  pause: { from: ["active"], to: "paused" },
  end: { from: ["active", "paused", "approved"], to: "ended" },
};

export function canTransition(action: CampaignAction, status: CampaignStatus): boolean {
  return campaignTransitions[action].from.includes(status);
}

/** Hành động khả dụng cho một trạng thái (để UI hiển thị đúng nút). */
export function availableActions(status: CampaignStatus): CampaignAction[] {
  return (Object.keys(campaignTransitions) as CampaignAction[]).filter((a) => canTransition(a, status));
}

export const goalTransitions: Record<"pause" | "resume", { from: ChannelGoalStatus[]; to: ChannelGoalStatus }> = {
  pause: { from: ["active"], to: "paused" },
  resume: { from: ["paused"], to: "active" },
};
