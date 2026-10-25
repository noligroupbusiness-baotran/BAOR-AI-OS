// Lọc một trang theo ngữ cảnh chiến dịch (?campaign=&goal=, truyền từ trang chiến dịch): chỉ giữ thực thể đã gắn chiến dịch
// (và mục tiêu kênh nếu có). Không có tham số → không lọc. Chiến dịch không tồn tại → không lọc (thanh lọc báo "không tìm thấy").
import { campaignRepo } from "./repository";
import type { CampaignContext } from "./context";
import type { Campaign, LinkedEntityType } from "./types";

export interface CampaignEntityFilter {
  campaign: Campaign;
  /** ID thực thể (bài đăng / quảng cáo / lead / video…) đã gắn chiến dịch, theo mục tiêu kênh nếu có. */
  ids: Set<string>;
  goalId: string | null;
}

export function campaignFilterFor(ctx: CampaignContext, types: LinkedEntityType | LinkedEntityType[]): CampaignEntityFilter | null {
  if (!ctx.campaignId) return null;
  const campaign = campaignRepo.get(ctx.campaignId);
  if (!campaign) return null;
  const want = new Set(Array.isArray(types) ? types : [types]);
  const ids = new Set(campaignRepo.links(campaign.id, ctx.channelGoalId).filter((l) => want.has(l.entityType)).map((l) => l.entityId));
  return { campaign, ids, goalId: ctx.channelGoalId };
}

/** Giữ phần tử thuộc chiến dịch đang lọc (không lọc thì trả nguyên danh sách). */
export function keepInCampaign<T>(items: T[], f: CampaignEntityFilter | null, idOf: (x: T) => string | string[] = (x) => (x as { id: string }).id): T[] {
  if (!f) return items;
  return items.filter((x) => {
    const id = idOf(x);
    return Array.isArray(id) ? id.some((i) => f.ids.has(i)) : f.ids.has(id);
  });
}

/** Bài (chữ / video) thuộc chiến dịch: chính bài đã gắn, hoặc là bài của video đã gắn. ids = null → không lọc. */
export function postInCampaign(p: { id: string; videoId?: string | null }, ids: Set<string> | null): boolean {
  return !ids || ids.has(p.id) || (!!p.videoId && ids.has(p.videoId));
}
