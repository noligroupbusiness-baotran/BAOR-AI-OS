import Link from "next/link";
import { Megaphone } from "lucide-react";
import { channelLabel } from "@/config/channels";
import { campaignRepo } from "@/lib/campaigns/repository";
import { CAMPAIGN_PARAM, GOAL_PARAM, withCampaignContext, type CampaignContext } from "@/lib/campaigns/context";
import { CampaignStatusPill } from "./status";
import { inputClass } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

// Thanh ngữ cảnh dùng chung: đặt ở đầu các phân hệ (Nội dung, Video, Đăng bài, Khách hàng...).
// Có campaign_id trên URL → hiện chiến dịch và mục tiêu kênh đang làm việc, kèm nút bỏ ngữ cảnh.
// Không có → hiện bộ chọn nhỏ để gắn công việc vào một chiến dịch.
export function CampaignContextBar({ ctx, pathname, params, note }: { ctx: CampaignContext; pathname: string; params: Record<string, string | undefined>; note?: string }) {
  const campaign = ctx.campaignId ? campaignRepo.get(ctx.campaignId) : undefined;
  const goal = ctx.channelGoalId ? campaignRepo.goal(ctx.channelGoalId) : undefined;
  const clear = withCampaignContext(`${pathname}?${new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => !!e[1])).toString()}`, {});

  if (ctx.campaignId && !campaign) {
    return (
      <div className="card mt-3.5 flex flex-wrap items-center gap-2 border-amber/40 bg-amber-soft/40 px-4 py-2.5 text-[12.5px]">
        <span className="text-ink">Không tìm thấy chiến dịch được truyền sang.</span>
        <Link href={clear} className="ml-auto font-medium text-jade hover:underline">Bỏ ngữ cảnh</Link>
      </div>
    );
  }

  if (campaign) {
    return (
      <div className="card mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-jade/40 px-4 py-2.5 text-[12.5px]">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-jade-soft text-jade"><Megaphone size={14} aria-hidden /></span>
        <span className="text-ink-2">Đang làm việc trong chiến dịch</span>
        <Link href={`/campaigns/${campaign.id}`} className="font-semibold text-ink hover:underline">{campaign.name}</Link>
        <CampaignStatusPill status={campaign.status} />
        {goal && goal.campaignId === campaign.id && (
          <span className="text-ink-2">
            · Mục tiêu kênh <b className="text-ink">{channelLabel(goal.channel)}</b>: {goal.objective}
          </span>
        )}
        {note && <span className="text-ink-3">· {note}</span>}
        <Link href={clear} className="ml-auto font-medium text-jade hover:underline">Bỏ ngữ cảnh</Link>
      </div>
    );
  }

  return <CampaignPicker pathname={pathname} params={params} />;
}

// Bộ chọn chiến dịch + mục tiêu kênh dùng chung (biểu mẫu GET, giữ nguyên các tham số khác).
export function CampaignPicker({ pathname, params, compact }: { pathname: string; params: Record<string, string | undefined>; compact?: boolean }) {
  const campaigns = campaignRepo.list().filter((c) => c.status !== "ended");
  if (campaigns.length === 0) return null;
  const keep = Object.entries(params).filter(([k, v]) => v && k !== CAMPAIGN_PARAM && k !== GOAL_PARAM && k !== "toast" && k !== "tone");
  return (
    <form method="get" action={pathname} className={compact ? "flex flex-wrap items-center gap-2" : "card mt-3.5 flex flex-wrap items-center gap-2 px-4 py-2.5"}>
      {keep.map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {!compact && <span className="text-[12.5px] text-ink-2">Gắn vào chiến dịch:</span>}
      <label className="min-w-0">
        <span className="sr-only">Chiến dịch</span>
        <select name={CAMPAIGN_PARAM} defaultValue="" className={`${inputClass} h-7 w-auto max-w-[260px] text-[12px]`}>
          <option value="">Chọn chiến dịch</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </label>
      <label className="min-w-0">
        <span className="sr-only">Mục tiêu kênh</span>
        <select name={GOAL_PARAM} defaultValue="" className={`${inputClass} h-7 w-auto max-w-[260px] text-[12px]`}>
          <option value="">Mục tiêu kênh (tùy chọn)</option>
          {campaigns.map((c) => (
            <optgroup key={c.id} label={c.name}>
              {campaignRepo.goals(c.id).map((g) => (
                <option key={g.id} value={g.id}>{channelLabel(g.channel)} · {g.objective}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <Button type="submit" variant="soft">Áp dụng</Button>
    </form>
  );
}
