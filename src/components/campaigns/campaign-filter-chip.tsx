import Link from "next/link";
import { X } from "lucide-react";
import { channelLabel } from "@/config/channels";
import { campaignRepo } from "@/lib/campaigns/repository";
import type { CampaignEntityFilter } from "@/lib/campaigns/filter";

// Nhãn ngắn "Đang lọc: <chiến dịch> ×" khi trang mở từ chiến dịch (?campaign=&goal=). × = bỏ lọc (clearHref).
export function CampaignFilterChip({ filter, clearHref, missing }: { filter: CampaignEntityFilter | null; clearHref: string; missing?: boolean }) {
  if (!filter && !missing) return null;
  const goal = filter?.goalId ? campaignRepo.goal(filter.goalId) : undefined;
  return (
    <div className="mt-3.5 flex flex-wrap items-center gap-2">
      <span className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-full border border-jade/40 bg-jade-soft/50 pl-3 pr-1 text-[12px] text-ink">
        <span className="text-ink-2">Đang lọc:</span>
        {filter ? (
          <Link href={`/campaigns/${filter.campaign.id}`} className="truncate font-semibold hover:underline">
            {filter.campaign.name}
            {goal && goal.campaignId === filter.campaign.id ? ` · ${channelLabel(goal.channel)}` : ""}
          </Link>
        ) : (
          <span className="font-semibold text-amber">không tìm thấy chiến dịch</span>
        )}
        <Link href={clearHref} aria-label="Bỏ lọc chiến dịch" title="Bỏ lọc" className="grid h-5 w-5 place-items-center rounded-full text-ink-2 hover:bg-ground-2 hover:text-ink">
          <X size={12} aria-hidden />
        </Link>
      </span>
    </div>
  );
}
