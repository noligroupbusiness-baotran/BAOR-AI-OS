import Link from "next/link";
import { channelLabel } from "@/config/channels";
import { campaignRepo, type EntityCampaignLink } from "@/lib/campaigns/repository";
import type { LinkedEntityType } from "@/lib/campaigns/types";
import { linkEntityToCampaign, unlinkEntityFromCampaign } from "@/lib/actions/campaigns";
import { Pill } from "@/components/ui/pill";
import { inputClass } from "@/components/ui/field";

// Nhãn chiến dịch của một thực thể (insight, nội dung, video, bài đăng, lead...) dùng ở mọi phân hệ.
export function CampaignTags({ links }: { links?: EntityCampaignLink[] }) {
  if (!links || links.length === 0) return null;
  return (
    <>
      {links.map((l) => (
        <Link key={`${l.campaignId}-${l.channelGoalId ?? ""}`} href={`/campaigns/${l.campaignId}?tab=activity`} title={`Mở chiến dịch ${l.campaignName}`}>
          <Pill tone="jade">{l.campaignName}{l.channel ? ` · ${channelLabel(l.channel)}` : ""}</Pill>
        </Link>
      ))}
    </>
  );
}

// Biểu mẫu nhỏ "Gắn vào chiến dịch" đặt cạnh một thực thể. Mặc định thu gọn thành một liên kết,
// bấm vào mới mở bộ chọn (qua tham số ?link=<entityId>) để bảng không bị dày.
export function LinkToCampaignForm({ entityType, entityId, status, back, links, compact, open }: { entityType: LinkedEntityType; entityId: string; status?: string; back: string; links?: EntityCampaignLink[]; compact?: boolean; open?: boolean }) {
  const campaigns = campaignRepo.list().filter((c) => c.status !== "ended");
  if (campaigns.length === 0) return null;
  if (!open) {
    const sep = back.includes("?") ? "&" : "?";
    const [path, hash] = back.split("#");
    return (
      <Link href={`${path}${sep}link=${encodeURIComponent(entityId)}${hash ? `#${hash}` : ""}`} className="text-[11.5px] font-medium text-jade hover:underline">
        {links?.length ? "Sửa gắn" : "Gắn chiến dịch"}
      </Link>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {links?.map((l) => (
        <form key={l.campaignId} action={unlinkEntityFromCampaign} className="inline">
          <input type="hidden" name="entityType" value={entityType} />
          <input type="hidden" name="entityId" value={entityId} />
          <input type="hidden" name="campaignId" value={l.campaignId} />
          <input type="hidden" name="back" value={back} />
          <button type="submit" className="cursor-pointer text-[11.5px] text-ink-3 hover:text-brick hover:underline" title={`Bỏ gắn khỏi ${l.campaignName}`}>
            Bỏ gắn {compact ? "" : l.campaignName}
          </button>
        </form>
      ))}
      <form action={linkEntityToCampaign} className="flex flex-wrap items-center gap-1.5">
        <input type="hidden" name="entityType" value={entityType} />
        <input type="hidden" name="entityId" value={entityId} />
        <input type="hidden" name="status" value={status ?? ""} />
        <input type="hidden" name="back" value={back} />
        <label className="sr-only" htmlFor={`link-${entityType}-${entityId}`}>Chiến dịch</label>
        <select id={`link-${entityType}-${entityId}`} name="campaignId" required defaultValue="" className={`${inputClass} h-6 w-auto max-w-[220px] text-[11.5px]`}>
          <option value="" disabled>{links?.length ? "Gắn thêm chiến dịch…" : "Gắn vào chiến dịch…"}</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select name="channelGoalId" defaultValue="" className={`${inputClass} h-6 w-auto max-w-[200px] text-[11.5px]`} aria-label="Mục tiêu kênh">
          <option value="">Kênh: chọn sau</option>
          {campaigns.map((c) => (
            <optgroup key={c.id} label={c.name}>
              {campaignRepo.goals(c.id).map((g) => (
                <option key={g.id} value={g.id}>{channelLabel(g.channel)}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <button type="submit" className="cursor-pointer rounded-full border border-border-2 px-2 py-0.5 text-[11.5px] font-medium text-ink hover:border-jade hover:text-jade">Gắn</button>
      </form>
    </div>
  );
}
