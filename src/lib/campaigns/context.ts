// Ngữ cảnh chiến dịch dùng chung giữa các phân hệ.
// Khi người dùng đi từ Chiến dịch sang Nội dung, Video, Đăng bài, Khách hàng..., ID chiến dịch và
// mục tiêu kênh được truyền qua tham số URL để phân hệ đích tự điền, không bắt chọn lại.
import type { LinkedEntityType } from "./types";

export const CAMPAIGN_PARAM = "campaign";
export const GOAL_PARAM = "goal";

export interface CampaignContext {
  campaignId: string | null;
  channelGoalId: string | null;
}

type Params = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined): string | null => {
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.trim() ? s.trim() : null;
};

export function readCampaignContext(params: Params): CampaignContext {
  return { campaignId: first(params[CAMPAIGN_PARAM]), channelGoalId: first(params[GOAL_PARAM]) };
}

// Gắn ngữ cảnh vào một đường dẫn bất kỳ, giữ nguyên query đã có.
export function withCampaignContext(path: string, ctx: Partial<CampaignContext>): string {
  const [base, query = ""] = path.split("?");
  const [pathname, hash] = base.split("#");
  const sp = new URLSearchParams(query);
  if (ctx.campaignId) sp.set(CAMPAIGN_PARAM, ctx.campaignId);
  else sp.delete(CAMPAIGN_PARAM);
  if (ctx.channelGoalId) sp.set(GOAL_PARAM, ctx.channelGoalId);
  else sp.delete(GOAL_PARAM);
  const q = sp.toString();
  return `${pathname}${q ? `?${q}` : ""}${hash ? `#${hash}` : ""}`;
}

// Đường dẫn mở đúng phân hệ cho một thực thể đã liên kết, kèm ngữ cảnh chiến dịch.
export function entityHref(type: LinkedEntityType, entityId: string, ctx: Partial<CampaignContext>, entityStatus?: string): string {
  let path: string;
  switch (type) {
    case "insight":
      path = "/insights#insights";
      break;
    case "content": {
      const tab = entityStatus === "proposed" ? "proposed" : entityStatus === "in_progress" || entityStatus === "review" ? "mine" : "done";
      path = `/content?tab=${tab}&open=${encodeURIComponent(entityId)}`;
      break;
    }
    case "asset":
      path = "/content";
      break;
    case "video":
      path = "/video-studio";
      break;
    case "publication":
    case "ad":
      path = "/publishing";
      break;
    case "lead":
      path = "/customers?tab=leads";
      break;
    case "order":
      path = "/customers";
      break;
    case "automation_run":
      path = "/automation";
      break;
    case "approval":
      path = "/dashboard";
      break;
    case "revenue":
      path = "/reports";
      break;
  }
  return withCampaignContext(path, ctx);
}
